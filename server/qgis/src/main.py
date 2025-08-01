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


@app.get("/api/qgis/v1/hello", operation_id="get_hello")
def get_hello():
    return {"Hello": "qgis", **settings.model_dump()}


class FixGeometriesRequest(BaseModel):
    file_url: HttpUrl


class FixGeometriesResponse(BaseModel):
    file_url: HttpUrl


@app.post(
    "/api/qgis/v1/fix-geometries",
    summary="Fix geometries",
    responses={
        200: {"model": FixGeometriesResponse, "description": "Success"},
    },
    operation_id="fix_geometries",
)
async def fix_geometries(request: FixGeometriesRequest):
    file_path: str = static_url_to_file_path(request.file_url)
    out_path = get_output_path(file_path)

    run_cmd(
        f"""qgis_process run native:fixgeometries --distance_units=meters --area_units=m2 --ellipsoid=EPSG:7004 --INPUT="{file_path}" --METHOD=0 --OUTPUT="{out_path}" """
    )

    result = FixGeometriesResponse(file_url=HttpUrl(file_path_to_static_url(out_path)))
    return result
