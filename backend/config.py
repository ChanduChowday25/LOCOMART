"""
LOCOMART — Backend Configuration
Loads settings from .env file via pydantic-settings.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings — all values loaded from environment variables."""

    # App
    app_env: str = "development"
    app_debug: bool = True
    secret_key: str = "change-me-in-production"

    # InsForge
    insforge_url: str = "https://5xekk2s5.ap-southeast.insforge.app"
    insforge_api_key: str = ""   # Admin API key — used for DB health check
    insforge_anon_key: str = ""  # Anonymous JWT — used by frontend

    # Database (for future SQLAlchemy direct connection when deployed on InsForge)
    # These are optional for local dev; required when deployed on InsForge infra.
    database_url: str = ""
    database_sync_url: str = ""

    # CORS
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Return CORS origins as a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — call this everywhere instead of instantiating directly."""
    return Settings()
