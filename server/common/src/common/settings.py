from urllib.parse import urlparse

from pydantic import Field, HttpUrl, PostgresDsn, field_serializer
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="public_")

    public_url: HttpUrl = HttpUrl("http://localhost")

    database_url: PostgresDsn = Field(
        alias="DATABASE_URL", default=PostgresDsn("postgresql://user@host:5432/dbname")
    )

    # files
    static_files_url_path: str = "/static/files"
    files_dir_path: str = "/data/files"
    supported_file_types: set[tuple[str, str, str, bool]] = {
        # extension, mime type, label, multiple?
        (".dxf", "application/octet-stream", "dxf", False),
        (".dxf", "image/vnd.dxf", "dxf", False),
        (".zip", "application/zip", "vfk", True),
    }
    files_ttl_by_label: dict[str, int] = {
        "dxf": 7 * 24 * 60 * 60,
    }

    @field_serializer("database_url")
    def serialize_redacted_url(self, database_url: PostgresDsn):
        db_url = urlparse(str(database_url))
        if db_url.password is not None:
            host_info = db_url.netloc.rpartition("@")[-1]
            db_url = db_url._replace(netloc=f"{db_url.username}:***@{host_info}")
        return db_url.geturl()


settings = Settings()
