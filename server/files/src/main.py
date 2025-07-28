import logging
import os
import shutil
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from common.cmd import run_cmd
from common.files import file_path_to_static_url
from common.settings import settings
from db import util as db_util

app = FastAPI()


@app.get("/api/files/v1/hello")
def get_hello():
    return {"Hello": "files", **settings.model_dump()}


# Configuration
MAX_FILE_SIZE_MB: int = 200
UPLOAD_DIRECTORY: str = settings.files_dir_path
Path(UPLOAD_DIRECTORY).mkdir(parents=True, exist_ok=True)

# Mount the static directory
app.mount(
    settings.static_files_url_path,
    StaticFiles(directory=UPLOAD_DIRECTORY),
    name="files",
)


# Define response model
class PostFileResponse(BaseModel):
    filename: str
    url: str


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
    summary="Upload a File",
    operation_id="post_files",
    responses={
        200: {
            "model": list[PostFileResponse],
            "description": "Files uploaded successfully!",
        },
        400: {"description": "Unsupported files"},
        413: {"description": "File size exceeds limit"},
        500: {"description": "An error occurred while uploading files"},
    },
)
async def post_files(label: str, files: list[UploadFile]):
    """
    Endpoint to upload a file.
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

        result: list[PostFileResponse] = []
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
            result.append(PostFileResponse(filename=sanitized_filename, url=public_url))
        return result

    except Exception as e:
        logging.error("Error occurred while uploading file", exc_info=True)
        if unique_directory_path:
            shutil.rmtree(unique_directory_path)  # Clean up partially written files
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while uploading the file: {str(e)}",
        )
