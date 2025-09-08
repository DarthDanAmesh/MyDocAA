# backend/config.py
from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from dotenv import load_dotenv
import os

load_dotenv()

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./files.db")

    # File uploads
    MAX_FILE_SIZE_MB: int = 5
    UPLOAD_DIR: str = "./uploads"

    # Vector DB + Embeddings
    CHROMA_DB_DIR: str = "./chroma_db"
    EMBEDDING_MODEL: str = "nomic-embed-text" #ollama pull nomic-embed-text (this one is 278MB), mxbai-embed-large (670MB), or some other embedding model
    OLLAMA_URL: str = "http://localhost:11434"

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "placeholder-dev-key")  # default for dev/test

    # App-specific
    NUMBER_OF_EXPECTED_MAX_DOCUMENTS: int = 1000  # adjust as needed

    model_config = ConfigDict(env_file=".env")


@lru_cache
def get_settings() -> Settings:
    return Settings()
