# app/config.py
from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from dotenv import load_dotenv
import os

load_dotenv()

class Settings(BaseSettings):
    MAX_FILE_SIZE_MB: int = 5
    UPLOAD_DIR: str = "uploads"
    SECRET_KEY: str = "insecure-dev-key" #default for dev/test

    model_config = ConfigDict(env_file=".env")


@lru_cache
def get_settings() -> Settings:
    return Settings()
