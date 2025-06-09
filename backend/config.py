from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    fireworks_api_key: str = ""  # Make it optional with empty string default

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
