# backend\schemas\file_schema.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class FileBase(BaseModel):
    file_id: str
    filename: str
    content_type: str
    size: int
    user_id: str


class FileCreate(FileBase):
    file_path: str


class FileResponse(FileBase):
    created_at: datetime

    # ✅ Pydantic v2: Use model_config instead of Config
    model_config = {
        "from_attributes": True  # replaces orm_mode=True
    }
