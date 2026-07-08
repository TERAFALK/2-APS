from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "production"

    database_url: str = "postgresql+psycopg://aps:aps@db:5432/aps"
    redis_url: str = "redis://redis:6379/0"

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 14

    first_admin_email: str = "admin@vanertekno.se"
    first_admin_password: str = "admin"


settings = Settings()
