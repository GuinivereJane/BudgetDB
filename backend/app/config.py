from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://budget:budget@db:5432/budgetdb"
    allowed_origins: list[str] = ["http://localhost:5173"]
    statement_storage_dir: str = "/tmp/statements"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
