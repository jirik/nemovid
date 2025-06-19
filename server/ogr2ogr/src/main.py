from fastapi import FastAPI

from settings import settings

app = FastAPI()


@app.get("/api/v1/hello")
def get_hello():
    return {"Hello": "ogr2ogr", **settings.model_dump()}
