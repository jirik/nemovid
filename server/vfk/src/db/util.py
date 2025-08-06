import datetime
from dataclasses import dataclass
from typing import Optional

from psycopg import sql
from psycopg.abc import Params, Query

from common import db
from common.settings import settings


def run_query(query: Query, params: Params | None = None) -> list:
    return db.run_query(query, params, db_uri=settings.database_url)


def run_statement(query: Query, params: Params | None = None):
    return db.run_statement(query, params, db_uri=settings.database_url)


@dataclass(kw_only=True)
class CadastralImport:
    zoning_id: str
    zoning_name: str
    valid_date: datetime.date


def _schema_to_id_and_date(schema_name: str) -> tuple[str, datetime.date]:
    zoning_id, date_str = schema_name[2:].split("_")
    return zoning_id, datetime.date.fromisoformat(date_str)


def get_schema_name(
    zoning_id: str, valid_date: datetime.date, *, tmp: bool = False
) -> str:
    date_str = valid_date.strftime("%Y%m%d")
    return f"ku{zoning_id}_{date_str}{'_tmp' if tmp else ''}"


def _get_vfk_schema_names() -> list[str]:
    assert settings.database_url.path is not None
    rows = run_query(
        sql.SQL(r"""
SELECT schema_name
from information_schema.schemata
where catalog_name=%s and schema_owner=%s and schema_name ~ '^ku\d{6}_\d{8}$'
order by schema_name
"""),
        (
            settings.database_url.path[1:],
            settings.database_url.hosts()[0]["username"],
        ),
    )
    return [r[0] for r in rows]


def _get_vfk_schema_name(*, zoning_id: int) -> str | None:
    assert settings.database_url.path is not None
    rows = run_query(
        sql.SQL(r"""
SELECT schema_name
from information_schema.schemata
where catalog_name=%s and schema_owner=%s and schema_name ~ '^ku\d{6}_\d{8}$' and starts_with(schema_name, %s)
order by schema_name
"""),
        (
            settings.database_url.path[1:],
            settings.database_url.hosts()[0]["username"],
            f"ku{zoning_id}_",
        ),
    )
    return None if not rows else rows[0][0]


def get_vfk_imports() -> list[CadastralImport]:
    schema_names = _get_vfk_schema_names()
    if not schema_names:
        return []

    zoning_dates: dict[str, datetime.date] = {}

    for schema_name in schema_names:
        zoning_id, valid_date = _schema_to_id_and_date(schema_name)
        zoning_dates[zoning_id] = valid_date

    rows = run_query(
        sql.SQL(" UNION ALL ").join(
            sql.Composed(
                [
                    sql.SQL(r"""
(
SELECT {kukod}, nazev
from {katuze}
where kod={kukod}
)
""").format(
                        katuze=sql.Identifier(
                            get_schema_name(zoning_id, valid_date), "katuze"
                        ),
                        kukod=sql.Literal(int(zoning_id)),
                    )
                    for zoning_id, valid_date in zoning_dates.items()
                ]
            )
        )
    )

    result = []
    for row in rows:
        zoning_id = f"{row[0]}"
        zoning_name = row[1]
        import_date = zoning_dates[zoning_id]
        result.append(
            CadastralImport(
                zoning_id=zoning_id, valid_date=import_date, zoning_name=zoning_name
            )
        )

    return result


def ensure_empty_tmp_vfk_schema(zoning_id: str, valid_date: datetime.date):
    schema_name = get_schema_name(zoning_id, valid_date, tmp=True)
    run_statement(
        sql.SQL("""
        DROP SCHEMA IF EXISTS {vfkschema} CASCADE;
        CREATE SCHEMA {vfkschema};
        """).format(vfkschema=sql.Identifier(schema_name))
    )


def set_tmp_vfk_schema_as_main(zoning_id: str, valid_date: datetime.date):
    tmp_schema_name = get_schema_name(zoning_id, valid_date, tmp=True)
    schema_name = get_schema_name(zoning_id, valid_date)
    existing_schemas = _get_vfk_schema_names()
    schemas_to_remove = [
        s for s in existing_schemas if _schema_to_id_and_date(s)[0] == zoning_id
    ]
    run_statement(
        sql.Composed(
            [
                sql.SQL("""
    DROP SCHEMA IF EXISTS {schematoremove} CASCADE;
    """).format(
                    schematoremove=sql.Identifier(schema_to_remove),
                )
                for schema_to_remove in schemas_to_remove
            ]
            + [
                sql.SQL("""
    ALTER SCHEMA {tmpvfkschema} RENAME TO {vfkschema};
    """).format(
                    vfkschema=sql.Identifier(schema_name),
                    tmpvfkschema=sql.Identifier(tmp_schema_name),
                )
            ]
        )
    )


@dataclass(kw_only=True)
class OwnerType:
    type_code: int  # charos.kod
    type_group: str  # charos.opsub_type
    owner_ico: Optional[int] = None  # opsub.owner_ico


@dataclass(kw_only=True)
class TitleDeedOwnerOverview:
    title_deed_number: int  # tel.cislo_tel
    owners_count: int  # number of unique owners (eligible legal persons)
    owner_types: list[OwnerType]  # distinct owner types


def get_zoning_title_deeds_ownership(
    zoning_code: int, title_deed_numbers: list[int]
) -> list[TitleDeedOwnerOverview]:
    schema_name = _get_vfk_schema_name(zoning_id=zoning_code)
    if not schema_name:
        raise ValueError("Zoning schema not found")
    rows = run_query(
        sql.SQL("""
select tel.id tel_id,
      tel.katuze_kod,
      tel.cislo_tel,
      (
          select count(distinct vla1.opsub_id)
          from {vla_table} vla1
          where vla1.tel_id = tel.id
      ) pocet_vlastniku,
      (
          select jsonb_agg(distinct jsonb_strip_nulls(jsonb_build_object(
                      'opsub_type', opsub1.opsub_type,
                      'charos_kod', opsub1.charos_kod,
                      'ico', opsub1.ico
                  )))
          from {vla_table} vla2, {opsub_table} opsub1
          where (vla2.tel_id = tel.id and vla2.opsub_id = opsub1.id)
       ) as vlastnici
from {tel_table} tel
where tel.cislo_tel = ANY({title_deed_numbers})
order by tel.id
    """).format(
            tel_table=sql.Identifier(schema_name, "tel"),
            vla_table=sql.Identifier(schema_name, "vla"),
            opsub_table=sql.Identifier(schema_name, "opsub"),
            title_deed_numbers=sql.Literal(title_deed_numbers),
        )
    )
    result: list[TitleDeedOwnerOverview] = []
    for row in rows:
        _, _, cislo_tel, pocet_vlastniku, vlastnici = row
        vlastnici = vlastnici or []
        result.append(
            TitleDeedOwnerOverview(
                title_deed_number=cislo_tel,
                owners_count=pocet_vlastniku,
                owner_types=[
                    OwnerType(
                        type_code=vl["charos_kod"],
                        type_group=vl["opsub_type"],
                        owner_ico=vl.get("ico"),
                    )
                    for vl in vlastnici
                ],
            )
        )
    return result
