import datetime
from dataclasses import dataclass

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


def get_vfk_imports() -> list[CadastralImport]:
    assert settings.database_url.path is not None
    rows = run_query(
        sql.SQL(r"""
SELECT schema_name
from information_schema.schemata
where catalog_name=%s and schema_owner=%s and schema_name ~ '^ku\d{6}_\d{8}$'
"""),
        (
            settings.database_url.path[1:],
            settings.database_url.hosts()[0]["username"],
        ),
    )
    zonings: dict[str, tuple[str, datetime.date]] = {}

    for row in rows:
        schema_name = row[0]
        zoning_id, date_str = schema_name[2:].split("_")
        zonings[zoning_id] = (schema_name, datetime.date.fromisoformat(date_str))

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
                        katuze=sql.Identifier(schema_name, "katuze"),
                        kukod=sql.Literal(int(zoning_id)),
                    )
                    for zoning_id, (schema_name, _) in zonings.items()
                ]
            )
        )
    )

    result = []
    for row in rows:
        zoning_id = f"{row[0]}"
        zoning_name = row[1]
        import_date = zonings[zoning_id][1]
        result.append(
            CadastralImport(
                zoning_id=zoning_id, valid_date=import_date, zoning_name=zoning_name
            )
        )

    return result
