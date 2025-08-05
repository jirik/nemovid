from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field, HttpUrl

from common.cmd import run_cmd
from common.files import (
    file_path_to_static_url,
    get_output_path,
    static_url_to_file_path,
)
from common.settings import settings

app = FastAPI()


@app.get("/api/ogr2ogr/v1/hello")
def get_hello():
    return {"Hello": "ogr2ogr", **settings.model_dump()}


class DxfToGeojsonRequest(BaseModel):
    file_url: HttpUrl


class DxfToGeojsonResponse(BaseModel):
    file_url: HttpUrl


class FileUrl(BaseModel):
    url: HttpUrl
    archived_file_path: Optional[str] = None


@app.post(
    "/api/ogr2ogr/v1/dxf-to-geojson",
    summary="DXF to GeoJSON",
    operation_id="dxf_to_geojson",
    responses={
        200: {"model": DxfToGeojsonResponse, "description": "Success"},
    },
)
async def post_dxf_to_geojson(request: DxfToGeojsonRequest):
    file_path: str = static_url_to_file_path(request.file_url)
    out_path = get_output_path(file_path)

    run_cmd(
        f"""ogr2ogr "{out_path}" "{file_path}" -f GeoJSON --config DXF_FEATURE_LIMIT_PER_BLOCK -1 -a_srs EPSG:5514 --config DXF_ENCODING utf-8 --config DXF_HATCH_TOLERANCE 2 -dim XY -dialect SQLITE -sql "SELECT * FROM entities WHERE LOWER(GeometryType(geometry)) LIKE '%polygon%'" """
    )

    result = DxfToGeojsonResponse(file_url=HttpUrl(file_path_to_static_url(out_path)))
    return result


def _file_url_to_gdal_path(file_url: FileUrl) -> str:
    file_path: str = static_url_to_file_path(file_url.url)
    if file_url.archived_file_path is not None:
        file_path = f"/vsizip/{file_path}/{file_url.archived_file_path}"
    return file_path


class VfkToPostgisRequest(BaseModel):
    file_url: FileUrl
    db_schema: str = Field(pattern=r"^[0-9a-zA-Z_]+$")


@app.post(
    "/api/ogr2ogr/v1/vfk-to-postgis",
    summary="VFK to PostGIS",
    operation_id="vfk_to_postgis",
    responses={
        200: {},
    },
)
async def post_vfk_to_postgis(request: VfkToPostgisRequest):
    gdal_file_path: str = _file_url_to_gdal_path(request.file_url)

    run_cmd(
        f"""ogr2ogr -f PostgreSQL "{settings.database_url}" {gdal_file_path} --config OGR_VFK_DB_NAME {request.db_schema}.db --config OGR_VFK_DB_DELETE YES -lco SCHEMA={request.db_schema}"""
    )
