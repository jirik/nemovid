import logging
import re
import zipfile
from dataclasses import asdict
from datetime import date, datetime
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, HttpUrl

from common.files import static_url_to_file_path
from common.settings import settings
from db import util as db_util

logging.basicConfig(level=logging.INFO)

app = FastAPI()


@app.get("/api/vfk/v1/hello")
def get_hello():
    return {"Hello": "vfk", **settings.model_dump()}


class CadastralImport(BaseModel):
    zoning_id: str
    valid_date: date


@app.get(
    "/api/vfk/v1/db/imports",
    summary="List of imports in database",
    operation_id="list_db_imports",
    responses={
        200: {
            "model": list[CadastralImport],
            "description": "List of VFK imports in database",
        },
        404: {"description": "Directory does not exist"},
    },
)
async def list_db_imports():
    db_imports = db_util.get_vfk_imports()
    result = [CadastralImport(**asdict(ci)) for ci in db_imports]
    return result


def _get_valid_date(head_lines: list[str]) -> date:
    valid_line = next(ln for ln in head_lines if ln.startswith("&HPLATNOST;"))
    valid_match = re.match(r"^[^;]+;\"(?P<from>[^;]+)\".*$", valid_line)
    assert valid_match
    datetime_str = valid_match.group("from")
    dt = datetime.strptime(datetime_str, "%d.%m.%Y %H:%M:%S")
    return dt.date()


def _check_vfk_file_head(head_lines: list[str]) -> list[str]:
    problems = []
    version_line = next((ln for ln in head_lines if ln.startswith("&HVERZE;")), None)
    if version_line is None:
        problems.append("Nenalezen řádek s verzí souboru VFK")
    elif '"6.' not in version_line:
        problems.append("Jiná verze VFK souboru než 6")

    code_page_line = next(
        (ln for ln in head_lines if ln.startswith("&HCODEPAGE;")), None
    )
    if code_page_line is None:
        problems.append("Nenalezen řádek s kódováním souboru VFK")
    elif '"UTF-8"' not in code_page_line:
        problems.append("Jiné kódování než UTF-8")

    group_line = next((ln for ln in head_lines if ln.startswith("&HSKUPINA;")), None)
    if group_line is None:
        problems.append("Nenalezeny řádek se skupinami souboru VFK")
    elif '"VLST"' not in group_line:
        problems.append("Nenalezena skupina VLST")

    valid_line = next((ln for ln in head_lines if ln.startswith("&HPLATNOST;")), None)
    if valid_line is None:
        problems.append("Nenalezen řádek s časovou platností souboru VFK")
    else:
        valid_match = re.match(
            r"^[^;]+;\"(?P<from>[^;]+)\";\"(?P<to>[^;]+)\"$", valid_line
        )
        if not valid_match:
            problems.append("Neznámý formát časové platnosti souboru VFK")
        else:
            from_str = valid_match.group("from")
            to_str = valid_match.group("to")
            if from_str != to_str:
                problems.append("Data platnosti souboru se neshodují")

    changes_line = next((ln for ln in head_lines if ln.startswith("&HZMENY;")), None)
    if changes_line is None:
        problems.append("Nenalezen řádek s indikací změn souboru VFK")
    if changes_line != "&HZMENY;0":
        problems.append(
            "Soubor VFK obsahuje změny, nikoliv platná data k určitému okamžiku"
        )

    return problems


class FileUrl(BaseModel):
    url: HttpUrl
    archived_file_path: Optional[str] = None


class VfkMetadata(BaseModel):
    file: FileUrl
    problems: list[str]
    valid_date: Optional[date] = None


@app.post(
    "/api/vfk/v1/files/metadata",
    summary="Get metadata of VFK files",
    operation_id="get_files_metadata",
    responses={
        200: {
            "model": list[VfkMetadata],
            "description": "List of metadata of VFK files",
        },
    },
)
async def get_files_metadata(files: list[FileUrl]):
    lines_to_read = 12
    result: list[VfkMetadata] = []
    for file in files:
        file_path = static_url_to_file_path(file.url)
        if file.archived_file_path is None:
            with open(file_path, "b") as input_file:
                head = [next(input_file) for _ in range(lines_to_read)]
        else:
            with zipfile.ZipFile(file_path, "r") as zip_file:
                with zip_file.open(file.archived_file_path) as vfk_file:
                    head = [next(vfk_file) for _ in range(lines_to_read)]
        head = [ln.decode("utf-8").strip() for ln in head]
        problems = _check_vfk_file_head(head)
        md = VfkMetadata(file=file, problems=problems)
        if not problems:
            md.valid_date = _get_valid_date(head)
        result.append(md)
    return result
