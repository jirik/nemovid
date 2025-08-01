import logging
import os
import shutil
import time
import uuid
import zipfile
from pathlib import Path
from typing import Annotated, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi import Path as FastApiPath
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl

from common.cmd import run_cmd
from common.files import file_path_to_static_url, static_url_to_file_path
from common.settings import settings
from db import util as db_util

app = FastAPI()


@app.get("/api/files/v1/hello")
def get_hello():
    return {"Hello": "files", **settings.model_dump()}


# Configuration
MAX_FILE_SIZE_MB: int = 500
UPLOAD_DIRECTORY: str = settings.files_dir_path
Path(UPLOAD_DIRECTORY).mkdir(parents=True, exist_ok=True)

# Mount the static directory
app.mount(
    settings.static_files_url_path,
    StaticFiles(directory=UPLOAD_DIRECTORY),
    name="files",
)


class ListedFile(BaseModel):
    filename: str
    url: str
    archived_file_paths: Optional[list[str]] = None


# Define response model
class PostFilesResponse(BaseModel):
    files: list[ListedFile]
    dirname: str


def clean_up_old_files(*, label: str):
    assert label in settings.files_ttl_by_label
    files_ttl = settings.files_ttl_by_label[label]
    now = time.time()
    file_uuids = db_util.get_file_uuids(label=label)
    uuids_to_remove_from_db = []
    for file_uuid in file_uuids:
        file_path = os.path.join(UPLOAD_DIRECTORY, file_uuid.hex)
        if os.path.exists(file_path):
            is_old = os.stat(file_path).st_mtime < now - files_ttl
            if is_old:
                uuids_to_remove_from_db.append(file_uuid)
                print(f"Deleting old file: {file_path}")
                run_cmd(f"rm -rf {file_path}")
        else:
            uuids_to_remove_from_db.append(file_uuid)
    db_util.delete_files_by_uuid(uuids=uuids_to_remove_from_db)


@app.post(
    "/api/files/v1/files",
    summary="Upload Files",
    operation_id="post_files",
    responses={
        200: {
            "model": PostFilesResponse,
            "description": "Files uploaded successfully!",
        },
        400: {"description": "Unsupported files"},
        413: {"description": "File size exceeds limit"},
        500: {"description": "An error occurred while uploading files"},
    },
)
async def post_files(label: str, files: list[UploadFile]):
    """
    Endpoint to upload files.
    """
    unique_directory_path = None

    if any(
        file.size is None or file.size > MAX_FILE_SIZE_MB * 1024 * 1024
        for file in files
    ):
        raise HTTPException(status_code=413, detail="File size exceeds limit.")

    if len(files) == 0:
        raise HTTPException(status_code=400, detail="Empty list of files.")

    # Sanitize the filename
    if any(file.filename is None for file in files):
        raise HTTPException(
            status_code=400,
            detail="File without exception is not supported.",
        )

    sanitized_filenames = {
        (file.filename or ""): Path(file.filename or "").name for file in files
    }

    # Validate file content type
    if not any(
        (len(files) == 1 or supports_multiple)
        and label == supported_label
        and all(file.content_type == supported_mime for file in files)
        and all(
            sanitized_filename.endswith(supported_ext)
            for sanitized_filename in sanitized_filenames.values()
        )
        for supported_ext, supported_mime, supported_label, supports_multiple in settings.supported_file_types
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported combination of label, file types and names: {label} {[file.content_type for file in files]} {sanitized_filenames.values()}",
        )

    try:
        if label in settings.files_ttl_by_label:
            clean_up_old_files(label=label)

        # Generate a unique directory for the upload
        dir_uuid = uuid.uuid4()
        unique_directory_name = dir_uuid.hex
        unique_directory_path = Path(UPLOAD_DIRECTORY) / unique_directory_name
        unique_directory_path.mkdir(parents=True, exist_ok=True)

        db_util.insert_file(uuid=dir_uuid, label=label)

        listed_files: list[ListedFile] = []
        for file in files:
            sanitized_filename = sanitized_filenames[file.filename or ""]

            # Construct the full file path
            file_path = unique_directory_path / sanitized_filename

            # Save the uploaded file
            with file_path.open("wb") as buffer:
                while chunk := file.file.read(1024 * 1024):
                    buffer.write(chunk)

            # Construct the public URL
            public_url = file_path_to_static_url(str(file_path))

            # Return response with public URL
            listed_files.append(ListedFile(filename=sanitized_filename, url=public_url))
        return PostFilesResponse(files=listed_files, dirname=unique_directory_name)

    except Exception as e:
        logging.error("Error occurred while uploading file", exc_info=True)
        if unique_directory_path:
            shutil.rmtree(unique_directory_path)  # Clean up partially written files
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while uploading the file: {str(e)}",
        )


@app.get(
    "/api/files/v1/directories/{directory_name}/list",
    summary="List files in directory",
    operation_id="list_directory_files",
    responses={
        200: {
            "model": list[ListedFile],
            "description": "List of files including archived files",
        },
        404: {"description": "Directory does not exist"},
    },
)
async def list_directory_files(
    directory_name: Annotated[
        str, FastApiPath(min_length=32, max_length=32, pattern="^[a-f0-9]+$")
    ],
):
    directory_path = Path(UPLOAD_DIRECTORY) / directory_name

    if not os.path.exists(directory_path) or not os.path.isdir(directory_path):
        raise HTTPException(status_code=404, detail="Directory does not exist")

    file_names = [
        fn for fn in os.listdir(directory_path) if os.path.isfile(directory_path / fn)
    ]
    result: List[ListedFile] = []
    for file_name in file_names:
        file_ext = os.path.splitext(file_name)[-1].lower()
        file_path = os.path.join(directory_path, file_name)
        result_item = ListedFile(
            filename=file_name, url=file_path_to_static_url(file_path)
        )
        if file_ext in {".zip"}:
            with zipfile.ZipFile(file_path, "r") as zip_file:
                archived_file_paths = zip_file.namelist()
                result_item.archived_file_paths = archived_file_paths
        result.append(result_item)

    return result


class ArchivedFile(BaseModel):
    url: HttpUrl
    archived_file_path: str


@app.post(
    "/api/files/v1/files/unzip",
    summary="Unzip Files",
    operation_id="unzip_files",
    responses={
        200: {
            "model": list[ListedFile],
            "description": "Files unzipped successfully",
        },
        404: {"description": "File does not exist"},
        400: {"description": "File is not archive"},
    },
)
async def unzip_files(archived_files: list[ArchivedFile]):
    """
    Endpoint to unzip files.
    """
    # checks
    for file in archived_files:
        extension = os.path.splitext(file.url.path or "")[-1].lower()
        if extension not in {".zip"}:
            raise HTTPException(
                status_code=400, detail=f"File extension is not an archive: {file.url}"
            )
        real_path = static_url_to_file_path(file.url)
        if not os.path.exists(real_path) or not os.path.isfile(real_path):
            raise HTTPException(
                status_code=404, detail=f"File does not exist: {file.url}"
            )

    result: list[ListedFile] = []
    for file in archived_files:
        real_path = static_url_to_file_path(file.url)
        result_dir = os.path.dirname(real_path)
        result_file_name = os.path.basename(file.archived_file_path)

        new_file_path = os.path.join(result_dir, result_file_name)
        if os.path.exists(new_file_path):
            continue

        with zipfile.ZipFile(real_path) as zipFile:
            zipFile.extract(file.archived_file_path, result_dir)
        result.append(
            ListedFile(
                filename=result_file_name, url=file_path_to_static_url(new_file_path)
            )
        )

    return result
