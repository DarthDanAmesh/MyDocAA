# app/routers/file_router.py
from fastapi import APIRouter, UploadFile, Depends
from app.services.file_service import AdvancedIngestionService
from app.security import verify_token
from app.limiter import limiter

router = APIRouter()

@router.post("/upload")
async def upload_file(file: UploadFile, user_id: str, token: str = Depends(verify_token)):
    service = AdvancedIngestionService()
    return await service.upload_file(file, user_id)

@router.post("/process/{file_path:path}", dependencies=[Depends(limiter.limit("5/minute"))])
async def process_file(file_path: str, file_type: str, token: str = Depends(verify_token)):
    service = AdvancedIngestionService()
    return await service.process_document(file_path, file_type)