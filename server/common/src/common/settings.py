from pydantic import Field, HttpUrl, PostgresDsn
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


settings = Settings()
