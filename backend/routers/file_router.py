# backend/routers/file_router.py
from fastapi import APIRouter, UploadFile, File, Depends, BackgroundTasks, HTTPException, Request
from sqlalchemy.orm import Session
from backend.services.file_service import AdvancedIngestionService, PDFTextExtractor
from backend.services.knowledge_base_service import KnowledgeBaseIndexer
from backend.config import get_settings
from backend.security import verify_token
from backend.db import get_db
from backend.models.file_model import FileRecord
from backend.models.user_model import User
from backend.schemas.file_schema import FileResponse
from slowapi.util import get_remote_address
from slowapi import Limiter
import os
import shutil
from typing import List

router = APIRouter(prefix="/api/files", tags=["files"])
settings = get_settings()
kb_indexer = KnowledgeBaseIndexer()
limiter = Limiter(key_func=get_remote_address)

def get_file_service():
    return AdvancedIngestionService()

@router.post("/", response_model=FileResponse)
@limiter.limit("5/minute")
async def upload_file(
    request: Request,  # Add Request parameter here
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user: User = Depends(verify_token),
    service: AdvancedIngestionService = Depends(get_file_service),
    db: Session = Depends(get_db),
):
    # Pass user and db to the upload_file method
    result = await service.upload_file(file, user, db)
    record = FileRecord(
        file_id=result["file_id"],
        filename=result["filename"],
        file_path=result["file_path"],
        content_type=result["content_type"],
        size=result["size"],
        user_id=user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    background_tasks.add_task(
        process_and_index_file,
        file_path=result["file_path"],
        filename=result["filename"],
        file_id=result["file_id"],
        file_type=result["content_type"],
        user_id=str(user.id),  # Pass the user_id to the indexing process
        kb_indexer=kb_indexer
    )
    return record

@router.get("/", response_model=List[FileResponse])
async def list_files(
    user: User = Depends(verify_token), 
    service: AdvancedIngestionService = Depends(get_file_service),
    db: Session = Depends(get_db)
):
    # Use the new get_user_files method
    files = await service.get_user_files(user, db)
    return files

@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: str, 
    user: User = Depends(verify_token),
    service: AdvancedIngestionService = Depends(get_file_service),
    db: Session = Depends(get_db)
):
    # Use the new get_file_by_id method
    file = await service.get_file_by_id(file_id, user, db)
    if not file:
        raise HTTPException(404, "File not found")
    return file

@router.delete("/{file_id}")
async def delete_file(
    file_id: str, 
    user: User = Depends(verify_token),
    service: AdvancedIngestionService = Depends(get_file_service),
    db: Session = Depends(get_db)
):
    # Use the new delete_file method
    success = await service.delete_file(file_id, user, db)
    if not success:
        raise HTTPException(404, "File not found")
    
    # Also remove from knowledge base
    kb_indexer.delete_by_file_id(file_id)
    
    return {"status": "success", "message": f"File {file_id} deleted and embeddings removed"}

@router.get("/{file_id}/tags")
async def get_file_tags(file_id: str, user: User = Depends(verify_token)):
    try:
        results = kb_indexer.collection.query(
            query_texts=[""],
            where={"file_id": file_id},
            n_results=1000
        )
        tags = set()
        for metadata in results.get("metadatas", [[]])[0]:
            tags.update(metadata.get("tags", []))
        return {"file_id": file_id, "tags": list(tags)}
    except Exception as e:
        raise HTTPException(500, f"Error fetching tags: {str(e)}")

@router.get("/{file_id}/status")
async def get_file_status(
    file_id: str, 
    user: User = Depends(verify_token), 
    db: Session = Depends(get_db)
):
    # Use user.id directly
    file = db.query(FileRecord).filter(FileRecord.file_id == file_id, FileRecord.user_id == user.id).first()
    if not file:
        raise HTTPException(404, "File not found")
    # TODO: Implement actual status tracking (e.g., via database field)
    return {"file_id": file_id, "status": "processed"}

def process_and_index_file(
    file_path: str, 
    filename: str, 
    file_id: str, 
    file_type: str, 
    user_id: str,  # Add user_id parameter
    kb_indexer: KnowledgeBaseIndexer
):
    temp_dir = f"./temp/{os.path.basename(file_path)}"
    os.makedirs(temp_dir, exist_ok=True)
    try:
        extracted_pages = {}
        if file_type == "application/pdf":
            extracted_pages = PDFTextExtractor.extract_text_from_pdf(file_path, temp_dir)
        else:
            service = AdvancedIngestionService()
            try:
                texts = service.process_document.__wrapped__(service, file_path, file_type)
            except Exception as e:
                raise RuntimeError(f"Processing failed: {e}")
            for i, text in enumerate(texts):
                txt_file_path = os.path.join(temp_dir, f"page_{i + 1}.txt")
                with open(txt_file_path, "w", encoding="utf-8") as f:
                    f.write(text)
                extracted_pages[f"page_{i + 1}"] = txt_file_path
        
        # Pass user_id to index_documents
        kb_indexer.index_documents(extracted_pages, filename, file_id, user_id=user_id)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)