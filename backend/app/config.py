from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Exempelvärden från .env.example som aldrig får användas i produktion.
_PLACEHOLDERS = ("change-me", "changeme", "dev-secret")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "production"

    # Hemligheter har inga standardvärden: saknas de i .env vägrar appen starta.
    database_url: str
    redis_url: str = "redis://redis:6379/0"

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 14

    first_admin_email: str = "admin@vanertekno.se"
    first_admin_password: str

    @model_validator(mode="after")
    def _reject_weak_secrets(self) -> "Settings":
        if self.environment != "production":
            return self
        for name in ("database_url", "jwt_secret", "first_admin_password"):
            if any(p in getattr(self, name).lower() for p in _PLACEHOLDERS):
                raise ValueError(f"{name.upper()} har kvar exempelvärdet från .env.example — byt det")
        if len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET måste vara minst 32 tecken")
        return self


settings = Settings()
