# app/routers/file_router.py
from fastapi import APIRouter, UploadFile, Depends
from typing import List
from app.services.file_service import AdvancedIngestionService
from app.security import verify_token
from slowapi.util import get_remote_address
from slowapi import Limiter

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Dependency: Service instance
def get_file_service():
    return AdvancedIngestionService()


@router.post(
    "/",
    summary="Upload a file",
    description="Upload a file (PDF/Image) for OCR and later processing."
)
async def upload_file(
    file: UploadFile,
    user_id: str,
    service: AdvancedIngestionService = Depends(get_file_service),
    token: dict = Depends(verify_token),
):
    return await service.upload_file(file, user_id)


@router.get(
    "/",
    summary="List user files",
    description="Get a list of files uploaded by the authenticated user."
)
async def list_files(
    user_id: str,
    service: AdvancedIngestionService = Depends(get_file_service),
    token: dict = Depends(verify_token),
):
    return await service.list_files(user_id)


@router.get(
    "/{file_id}",
    summary="Get file metadata",
    description="Fetch details about a specific uploaded file."
)
async def get_file(
    file_id: str,
    user_id: str,
    service: AdvancedIngestionService = Depends(get_file_service),
    token: dict = Depends(verify_token),
):
    return await service.get_file(file_id, user_id)


@router.post(
    "/{file_id}/process",
    summary="Process an uploaded file",
    description="Run OCR + embeddings + tagging on the given file.",
    dependencies=[Depends(limiter.limit("5/minute"))],
)
async def process_file(
    file_id: str,
    file_type: str,
    user_id: str,
    service: AdvancedIngestionService = Depends(get_file_service),
    token: dict = Depends(verify_token),
):
    return await service.process_document(file_id, file_type, user_id)


@router.delete(
    "/{file_id}",
    summary="Delete a file",
    description="Remove a file from storage and its embeddings from the database."
)
async def delete_file(
    file_id: str,
    user_id: str,
    service: AdvancedIngestionService = Depends(get_file_service),
    token: dict = Depends(verify_token),
):
    return await service.delete_file(file_id, user_id)
