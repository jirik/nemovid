import os.path
import uuid
from urllib.parse import unquote, urljoin

from pydantic import HttpUrl

from common.settings import settings


def file_path_to_static_url(file_path: str) -> str:
    rel_path = os.path.relpath(file_path, settings.files_dir_path)
    url_path = os.path.join(settings.static_files_url_path, rel_path)
    return urljoin(
        str(settings.public_url),
        url_path,
    )


def static_url_to_file_path(static_url: HttpUrl) -> str:
    assert static_url.path is not None
    url_path = unquote(static_url.path)
    rel_path = os.path.relpath(url_path, settings.static_files_url_path)
    return os.path.join(
        settings.files_dir_path,
        rel_path,
    )


def get_output_path(input_path: str) -> str:
    file_dir = os.path.dirname(input_path)
    out_name = f"{uuid.uuid4().hex}.geojson"
    out_path = os.path.join(file_dir, out_name)
    return out_path
