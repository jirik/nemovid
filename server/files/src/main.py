import logging
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()


@app.get("/api/hello")
def read_root():
    return {"Hello": "World"}


# Configuration
MAX_FILE_SIZE_MB: int = 100
UPLOAD_DIRECTORY: str = "/data/files"
Path(UPLOAD_DIRECTORY).mkdir(parents=True, exist_ok=True)

SUPPORTED_FILE_TYPES: set[tuple[str, str]] = {
    # extension, mime type
    (".dxf", "application/octet-stream"),
    (".dxf", "image/vnd.dxf"),
}

# Mount the static directory
app.mount("/static/files", StaticFiles(directory=UPLOAD_DIRECTORY), name="files")


# Define response model
class UploadResponse(BaseModel):
    filename: str
    message: str
    url: str  # Include the public URL in the response


@app.post(
    "/api/files",
    summary="Upload a File",
    responses={
        200: {"model": UploadResponse, "description": "File uploaded successfully!"},
        400: {"description": "Unsupported file"},
        413: {"description": "File size exceeds limit"},
        500: {"description": "An error occurred while uploading the file"},
    },
)
async def post_file(file: UploadFile = File(...)):
    """
    Endpoint to upload a file.
    """
    unique_directory_path = None

    if file.size is None or file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File size exceeds limit.")

    # Sanitize the filename
    if file.filename is None:
        raise HTTPException(
            status_code=400,
            detail="File without exception is not supported.",
        )

    sanitized_filename = Path(file.filename).name

    # Validate file content type
    if not any(
        file.content_type == mime and sanitized_filename.endswith(ext)
        for ext, mime in SUPPORTED_FILE_TYPES
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported combination of file type and extension: {file.content_type} {sanitized_filename}",
        )

    try:
        # Generate a unique directory for the upload
        unique_directory_name = uuid.uuid4().hex
        unique_directory_path = Path(UPLOAD_DIRECTORY) / unique_directory_name
        unique_directory_path.mkdir(parents=True, exist_ok=True)

        # Construct the full file path
        file_path = unique_directory_path / sanitized_filename

        # Save the uploaded file
        with file_path.open("wb") as buffer:
            while chunk := file.file.read(1024 * 1024):
                buffer.write(chunk)

        # Construct the public URL
        base_url = "http://yourdomain.com"
        public_url = (
            f"{base_url}/static/files/{unique_directory_name}/{sanitized_filename}"
        )

        # Return response with public URL
        return {
            "filename": sanitized_filename,
            "message": "File uploaded successfully!",
            "url": public_url,
        }

    except Exception as e:
        logging.error("Error occurred while uploading file", exc_info=True)
        if unique_directory_path:
            shutil.rmtree(unique_directory_path)  # Clean up partially written files
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while uploading the file: {str(e)}",
        )
