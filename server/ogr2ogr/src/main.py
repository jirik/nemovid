from fastapi import FastAPI
from pydantic import BaseModel, HttpUrl

from common.settings import settings

app = FastAPI()


@app.get("/api/ogr2ogr/v1/hello")
def get_hello():
    return {"Hello": "ogr2ogr", **settings.model_dump()}


class DxfToGeojsonOptions(BaseModel):
    file_url: HttpUrl


@app.post(
    "/api/ogr2ogr/v1/dfx-to-geojson",
    summary="DXF to GeoJSON",
)
async def post_dxf_to_geojson(options: DxfToGeojsonOptions):
    pass
