from uuid import UUID

from psycopg import sql
from psycopg.abc import Params, Query

from common import db
from common.settings import settings

TABLE_NAME = "file"


def run_query(query: Query, params: Params | None = None) -> list:
    return db.run_query(query, params, db_uri=settings.database_url)


def run_statement(query: Query, params: Params | None = None):
    return db.run_statement(query, params, db_uri=settings.database_url)


def insert_file(*, uuid: UUID, label: str):
    run_statement(
        sql.SQL("INSERT INTO {table} (uuid, label) VALUES (%s, %s)").format(
            table=sql.Identifier(TABLE_NAME),
        ),
        (uuid, label),
    )


def get_file_uuids(*, label: str) -> list[UUID]:
    rows = run_query(
        sql.SQL("SELECT uuid from {table} WHERE label = {label}").format(
            table=sql.Identifier(TABLE_NAME),
            label=sql.Literal(label),
        )
    )
    result = []
    for row in rows:
        assert len(row) == 1
        assert isinstance(row[0], UUID)
        result.append(row[0])
    return result


def delete_files_by_uuid(*, uuids: list[UUID]) -> None:
    run_statement(
        sql.SQL("DELETE FROM {table} WHERE uuid = ANY(%s)").format(
            table=sql.Identifier(TABLE_NAME),
        ),
        (uuids,),
    )
