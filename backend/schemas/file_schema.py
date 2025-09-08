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


class FileResponse(BaseModel):
    file_id: str
    filename: str
    content_type: str
    size: int
    user_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True
