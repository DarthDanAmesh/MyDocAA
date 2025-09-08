# backend/routers/chat_router.py
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from datetime import datetime
import json
import os
import shutil
from urllib.parse import unquote
import uuid
from typing import List, Dict, Any
from backend.config import get_settings
from backend.services.chat_service import ChatbotService
from backend.services.file_service import AdvancedIngestionService, PDFTextExtractor
from backend.services.knowledge_base_service import KnowledgeBaseIndexer
from backend.security import verify_token, verify_websocket_token
from backend.models.user_model import User  # Import User model
from backend.models.file_model import FileRecord # Import FileRecord model
from sqlalchemy.orm import Session  # Import Session for database operations
from backend.db import get_db  # Import get_db dependency

router = APIRouter(tags=["chat"])
settings = get_settings()
kb_indexer = KnowledgeBaseIndexer()
chatbot_service = ChatbotService(knowledge_base=kb_indexer)
file_service = AdvancedIngestionService()

class ChatRequest(BaseModel):
    message: str
    model: str = "qwen2:0.5b"

class ActionRequest(BaseModel):
    content: str
    model: str = "qwen2:0.5b"

@router.websocket("/chat/ws")
async def websocket_chat(websocket: WebSocket, user: User = Depends(verify_websocket_token)):
    await websocket.accept()
    user_id = str(user.id)
    conversation = []
    try:
        while True:
            data = await websocket.receive_json()
            query = data.get("content", "")
            model = data.get("model", "qwen2:0.5b")
            
            # Pass user_id and selected model to the chatbot service
            response = await chatbot_service.generate_response(
                query, 
                user_id=user_id,
                model=model
            )
            print(model)
            await websocket.send_json({
                "role": "assistant",
                "content": response["content"],
                "ragContext": response.get("ragContext", []),
                "model": response.get("model", model)
            })
            
            conversation.append({
                "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                "user_message": query,
                "bot_response": response["content"]
            })
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for user {user_id}")
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
        await websocket.send_json({"role": "assistant", "content": f"Error: {str(e)}", "ragContext": []})
    finally:
        # Save conversation history
        history_dir = os.path.join(settings.UPLOAD_DIR, user_id, "history")
        os.makedirs(history_dir, exist_ok=True)
        history_file = os.path.join(history_dir, f"conversation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(conversation, f, indent=2)

@router.post("/chat")
async def chat(request: ChatRequest, user: User = Depends(verify_token)):
    try:
        response = await chatbot_service.generate_response(
            request.message, 
            user_id=str(user.id),
            model=request.model
        )
        return {
            "content": response["content"], 
            "ragContext": response.get("ragContext", []), 
            "model": response.get("model", request.model)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@router.post("/chat/summarize")
async def summarize_message(request: ActionRequest, user: User = Depends(verify_token)):
    try:
        # Use the new summarize_text method
        response = await chatbot_service.summarize_text(
            request.content,
            model=request.model
        )
        return {
            "content": response["content"], 
            "ragContext": [],  # Summarization doesn't need RAG context
            "model": response.get("model", request.model)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization error: {str(e)}")

@router.post("/chat/humanize")
async def humanize_message(request: ActionRequest, user: User = Depends(verify_token)):
    try:
        # Use the new humanize_text method
        response = await chatbot_service.humanize_text(
            request.content,
            model=request.model
        )
        return {
            "content": response["content"], 
            "ragContext": [],  # Humanization doesn't need RAG context
            "model": response.get("model", request.model)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Humanization error: {str(e)}")

@router.post("/chat/export")
async def export_message(request: ActionRequest, user: User = Depends(verify_token)):
    try:
        user_id = str(user.id)  # Convert to string for file paths
        export_dir = os.path.join(settings.UPLOAD_DIR, user_id, "exports")
        os.makedirs(export_dir, exist_ok=True)
        export_file = os.path.join(export_dir, f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
        with open(export_file, 'w', encoding='utf-8') as f:
            f.write(request.content)
        return {"message": "Message exported", "file_path": export_file}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")

@router.delete("/chat/clear")
async def clear_conversation(user: User = Depends(verify_token)):
    try:
        user_id = str(user.id)  # Convert to string for file paths
        history_dir = os.path.join(settings.UPLOAD_DIR, user_id, "history")
        if os.path.exists(history_dir):
            shutil.rmtree(history_dir)
        return {"status": "success", "message": "Conversation history cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")

@router.post("/chat/reindex")
async def reindex(background_tasks: BackgroundTasks, user: User = Depends(verify_token), db: Session = Depends(get_db)):
    def reindex_all():
        user_id = str(user.id)  # Convert to string for file paths
        user_path = os.path.join(settings.UPLOAD_DIR, user_id)
        if not os.path.exists(user_path):
            print(f"Upload directory not found: {user_path}")
            return
        
        # Get all files for this user from the database
        files = db.query(FileRecord).filter(FileRecord.user_id == user.id).all()
        
        processed_count = 0
        failed_files = []
        
        for file_record in files:
            file_path = file_record.file_path
            if not os.path.exists(file_path):
                print(f"File not found: {file_path}")
                failed_files.append(f"{file_record.filename}: File not found")
                continue
                
            file_id = file_record.file_id
            file_name = file_record.filename
            file_type = file_record.content_type
            
            temp_dir = os.path.join("./temp", f"reindex_{file_id}")
            os.makedirs(temp_dir, exist_ok=True)
            
            try:
                extracted_pages = {}
                if file_type == "application/pdf":
                    extracted_pages = PDFTextExtractor.extract_text_from_pdf(file_path, temp_dir)
                else:
                    try:
                        texts = file_service.process_document.__wrapped__(file_service, file_path, file_type)
                    except Exception as e:
                        raise RuntimeError(f"Processing failed: {e}")
                    for i, text in enumerate(texts):
                        txt_file_path = os.path.join(temp_dir, f"page_{i + 1}.txt")
                        with open(txt_file_path, "w", encoding="utf-8") as f:
                            f.write(text)
                        extracted_pages[f"page_{i + 1}"] = txt_file_path
                
                if extracted_pages:
                    kb_indexer.index_documents(extracted_pages, document_name=unquote(file_name), file_id=file_id)
                    print(f"Reindexed: {file_name} (ID: {file_id})")
                    processed_count += 1
                else:
                    failed_files.append(f"{file_name} (no content extracted)")
            except Exception as e:
                print(f"Failed to process {file_name}: {str(e)}")
                failed_files.append(f"{file_name}: {str(e)}")
            finally:
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir, ignore_errors=True)
        
        print(f"Reindexing completed for user {user_id}. {processed_count} files processed.")
        if failed_files:
            print("Failures:", failed_files)
    
    background_tasks.add_task(reindex_all)
    return {"status": "success", "message": "Reindexing started in the background"}