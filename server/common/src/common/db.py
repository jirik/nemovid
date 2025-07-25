import logging
from urllib.parse import parse_qs, urlencode, urlparse

from psycopg import ClientCursor
from psycopg.abc import Params, Query
from psycopg_pool import ConnectionPool
from pydantic import PostgresDsn

logger = logging.getLogger(__name__)

CONNECTION_POOLS: dict[str, ConnectionPool] = {}


def _move_search_path_to_options(db_uri: str) -> str:
    new_db_uri = urlparse(db_uri)
    query_params = parse_qs(new_db_uri.query)
    search_path = query_params.pop("search_path", None)
    if search_path:
        assert "options" not in query_params
        assert isinstance(search_path, list)
        assert len(search_path) == 1

        query_params["options"] = [f"-csearch_path={search_path[0]}"]
    query_string = urlencode(query_params, doseq=True)
    new_db_uri = new_db_uri._replace(query=query_string).geturl()
    return new_db_uri


def get_connection_pool(db_uri: PostgresDsn) -> ConnectionPool:
    db_uri_str = str(db_uri)
    if db_uri_str not in CONNECTION_POOLS:
        new_db_uri = _move_search_path_to_options(db_uri_str)
        CONNECTION_POOLS[db_uri_str] = ConnectionPool(
            new_db_uri,
            kwargs={
                "cursor_factory": ClientCursor,
            },
        )
    pool = CONNECTION_POOLS[db_uri_str]
    return pool


def run_query(
    query: Query, params: Params | None = None, *, db_uri: PostgresDsn
) -> list:
    pool = get_connection_pool(db_uri=db_uri)
    with pool.connection() as conn:
        conn.autocommit = True

        with conn.cursor() as cur:
            assert isinstance(cur, ClientCursor)
            logger.info(f"query={cur.mogrify(query, params)}")
            cur.execute(query, params)
            rows = cur.fetchall()

    return rows


def run_statement(query: Query, params: Params | None = None, *, db_uri: PostgresDsn):
    pool = get_connection_pool(db_uri=db_uri)
    with pool.connection() as conn:
        conn.autocommit = True

        with conn.cursor() as cur:
            assert isinstance(cur, ClientCursor)
            logger.info(f"query={cur.mogrify(query, params)}")
            cur.execute(query, params)
