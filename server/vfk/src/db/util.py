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
    result = []
    for row in rows:
        zoning_id, date_str = row[0][2:].split("_")
        import_date = datetime.date.fromisoformat(date_str)
        result.append(CadastralImport(zoning_id=zoning_id, valid_date=import_date))

    return result
