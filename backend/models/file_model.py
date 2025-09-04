from sqlalchemy import Column, String, Integer, DateTime
from datetime import datetime
from backend.db import Base

class FileRecord(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(String, unique=True, index=True, nullable=False)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
