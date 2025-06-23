from pydantic import HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="public_")

    public_url: HttpUrl = HttpUrl("http://localhost")
    static_files_url_path: str = "/static/files"
    files_dir_path: str = "/data/files"


settings = Settings()
