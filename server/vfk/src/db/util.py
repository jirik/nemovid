import datetime
from dataclasses import dataclass
from enum import StrEnum
from typing import Optional

from psycopg import sql
from psycopg.abc import Params, Query

from common import db
from common.settings import settings


def run_query(query: Query, params: Params | None = None) -> list:
    return db.run_query(query, params, db_uri=settings.database_url)


def run_statement(query: Query, params: Params | None = None):
    return db.run_statement(query, params, db_uri=settings.database_url)


class ValueErrors(StrEnum):
    ZONING_SCHEMA_NOT_FOUND = "Zoning schema not found"
    MORE_TITLE_DEEDS_FOUND = "More title deeds found"


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
    zoning_code: int  # katuze.kod
    title_deed_id: int  # tel.id
    title_deed_number: int  # tel.cislo_tel
    owners_count: int  # number of unique owners (eligible legal persons)
    owner_types: list[OwnerType]  # distinct owner types


def get_zoning_title_deeds_ownership(
    zoning_code: int, title_deed_numbers: list[int]
) -> list[TitleDeedOwnerOverview]:
    schema_name = _get_vfk_schema_name(zoning_id=zoning_code)
    if not schema_name:
        raise ValueError(ValueErrors.ZONING_SCHEMA_NOT_FOUND)
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
where tel.cislo_tel = ANY({title_deed_numbers}) and tel.katuze_kod = {zoning_code}
order by tel.id
    """).format(
            tel_table=sql.Identifier(schema_name, "tel"),
            vla_table=sql.Identifier(schema_name, "vla"),
            opsub_table=sql.Identifier(schema_name, "opsub"),
            title_deed_numbers=sql.Literal(title_deed_numbers),
            zoning_code=sql.Literal(zoning_code),
        )
    )
    result: list[TitleDeedOwnerOverview] = []
    for row in rows:
        tel_id, katuze_kod, cislo_tel, pocet_vlastniku, vlastnici = row
        vlastnici = vlastnici or []
        result.append(
            TitleDeedOwnerOverview(
                zoning_code=katuze_kod,
                title_deed_id=tel_id,
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


@dataclass(kw_only=True)
class Parcel:
    id: int  # par.id
    zoning_code: int  # par.katuze_kod
    original_zoning_code: Optional[int] = None  # par.katuze_kod_puv
    type: str  # par.par_type (PKN/PZE)
    simplified_registry_source: Optional[str] = None  # zdpaze.nazev
    numbering_type: Optional[
        str
    ]  # par.druh_cislovani_par (1=Stavební parcela/2=Pozemková parcela), only if katuze.ciselna_rada != 1
    root_number: int  # par.kmenove_cislo_par
    subdivision_number: Optional[int] = None  # par.poddeleni_cisla_par
    part: Optional[int] = None  # par.dil_parcely


@dataclass(kw_only=True)
class LegalPerson:
    id: str  # opsub.id
    type_group: str  # opsub.opsub_type
    type_code: int  # opsub.charos_kod
    type: str  # charos.nazev
    ico: Optional[int] = None  # opsub.owner_ico


@dataclass(kw_only=True)
class Ownership:
    id: int  # vla.id
    legal_relationship_type: str  # typrav.nazev
    owner: LegalPerson


@dataclass(kw_only=True)
class TitleDeed:
    id: int  # tel.id
    number: int  # tel.cislo_tel
    zoning_code: int  # katuze.kod
    zoning_name: str  # katuze.nazev
    parcels: list[Parcel]
    ownership: list[Ownership]


def get_zoning_title_deed(
    zoning_code: int, title_deed_number: int
) -> tuple[TitleDeed | None, datetime.date]:
    schema_name = _get_vfk_schema_name(zoning_id=zoning_code)
    if not schema_name:
        raise ValueError(ValueErrors.ZONING_SCHEMA_NOT_FOUND)

    rows = run_query(
        sql.SQL("""
select tel.id tel_id,
       tel.cislo_tel,
       tel.katuze_kod,
       katuze.nazev katuze_nazev,
       (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', par1.id,
               'katuze_kod', par1.katuze_kod,
               'katuze_kod_puv', par1.katuze_kod_puv,
               'par_type', par1.par_type,
               'zdpaze_nazev', zdpaze1.nazev,
               'druh_cislovani_par', case
                                         when katuze.ciselna_rada <> 1 and par1.druh_cislovani_par = 1
                                             then 'Stavební parcela'
                                         when katuze.ciselna_rada <> 1 and par1.druh_cislovani_par = 2
                                             then 'Pozemková parcela'
                                         else null
                   end,
               'kmenove_cislo_par', par1.kmenove_cislo_par,
               'poddeleni_cisla_par', par1.poddeleni_cisla_par,
               'dil_parcely', par1.dil_parcely
                                           )))
        from {par_table} par1
                 left outer join {zdpaze_table} zdpaze1 on (par1.zdpaze_kod = zdpaze1.kod)
        where par1.tel_id = tel.id) as parcely,
       (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', vla1.id,
               'typrav_nazev', typrav1.nazev,
               'opsub_id', opsub1.id,
               'opsub_type', opsub1.opsub_type,
               'charos_kod', opsub1.charos_kod,
               'charos_nazev', charos1.nazev,
               'ico', opsub1.ico
                                           )))
        from {vla_table} vla1
                 inner join {typrav_table} typrav1 on (typrav1.kod = vla1.typrav_kod)
                 inner join {opsub_table} opsub1 on (opsub1.id = vla1.opsub_id)
                 inner join {charos_table} charos1 on (opsub1.charos_kod = charos1.kod)
        where vla1.tel_id = tel.id) as vlastnictvi

from {tel_table} tel
         inner join {katuze_table} katuze on (tel.katuze_kod = katuze.kod)
where tel.katuze_kod = {zoning_code} and tel.cislo_tel = {title_deed_number}
    """).format(
            tel_table=sql.Identifier(schema_name, "tel"),
            katuze_table=sql.Identifier(schema_name, "katuze"),
            par_table=sql.Identifier(schema_name, "par"),
            vla_table=sql.Identifier(schema_name, "vla"),
            opsub_table=sql.Identifier(schema_name, "opsub"),
            typrav_table=sql.Identifier(schema_name, "typrav"),
            charos_table=sql.Identifier(schema_name, "charos"),
            zdpaze_table=sql.Identifier(schema_name, "zdpaze"),
            zoning_code=sql.Literal(zoning_code),
            title_deed_number=sql.Literal(title_deed_number),
        )
    )

    title_deeds: list[TitleDeed] = []
    for row in rows:
        tel_id, cislo_tel, katuze_kod, katuze_nazev, parcely, vlastnictvi = row
        title_deeds.append(
            TitleDeed(
                id=tel_id,
                number=cislo_tel,
                zoning_code=katuze_kod,
                zoning_name=katuze_nazev,
                parcels=[
                    Parcel(
                        id=par["id"],
                        zoning_code=par["katuze_kod"],
                        original_zoning_code=par.get("katuze_kod_puv"),
                        type=par["par_type"],
                        simplified_registry_source=par.get("zdpaze_nazev"),
                        numbering_type=par.get("druh_cislovani_par"),
                        root_number=par["kmenove_cislo_par"],
                        subdivision_number=par.get("poddeleni_cisla_par"),
                        part=par.get("dil_parcely"),
                    )
                    for par in parcely
                ],
                ownership=[
                    Ownership(
                        id=vla["id"],
                        legal_relationship_type=vla["typrav_nazev"],
                        owner=LegalPerson(
                            id=vla["opsub_id"],
                            type_group=vla["opsub_type"],
                            type_code=vla["charos_kod"],
                            type=vla["charos_nazev"],
                            ico=vla.get("ico"),
                        ),
                    )
                    for vla in vlastnictvi
                ],
            )
        )
    if len(title_deeds) > 1:
        raise ValueError(ValueErrors.MORE_TITLE_DEEDS_FOUND)
    _, valid_date = _schema_to_id_and_date(schema_name)
    return (title_deeds[0] if len(title_deeds) > 0 else None), valid_date
