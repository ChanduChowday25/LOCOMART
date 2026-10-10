"""
LOCOMART — Backend Configuration
Loads settings from .env file via pydantic-settings.
"""

from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings — all values loaded from environment variables."""

    # App
    app_env: str = "development"
    app_debug: bool = False
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
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:3000"

    # Stripe Test Mode (M6)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def is_production(self) -> bool:
        """Return True if running in production mode."""
        return self.app_env.strip().lower() == "production"

    @property
    def effective_debug(self) -> bool:
        """Effective debug flag: forced False in production, otherwise honours app_debug."""
        if self.is_production:
            return False
        return self.app_debug

    @property
    def cors_origins_list(self) -> list[str]:
        """Return CORS origins as a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        """Ensure production environment requires a non-default, secure SECRET_KEY."""
        if self.is_production:
            insecure_placeholders = {
                "change-me-in-production",
                "replace-with-a-long-random-secret-key",
                "replace-with-a-long-random-secret-key-for-jwt-signing",
                "",
            }
            key_val = (self.secret_key or "").strip()
            if not key_val or key_val in insecure_placeholders:
                raise ValueError(
                    "Production configuration error: SECRET_KEY must be set to a secure, "
                    "non-default value when APP_ENV is 'production'."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — call this everywhere instead of instantiating directly."""
    return Settings()
