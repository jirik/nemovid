from fastapi import FastAPI
from pydantic import BaseModel, HttpUrl

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
