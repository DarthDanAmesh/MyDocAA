# backend/routers/chat_router.py
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from datetime import datetime
import json
import os
import shutil
from urllib.parse import unquote
import uuid
from typing import List
from backend.config import get_settings
from backend.services.chat_service import ChatbotService
from backend.services.file_service import AdvancedIngestionService, PDFTextExtractor
from backend.services.knowledge_base_service import KnowledgeBaseIndexer
from backend.security import verify_token, verify_websocket_token

router = APIRouter(prefix="/api/chat", tags=["chat"])
settings = get_settings()
kb_indexer = KnowledgeBaseIndexer()
chatbot_service = ChatbotService(knowledge_base=kb_indexer)
file_service = AdvancedIngestionService()

class ChatRequest(BaseModel):
    message: str
    model: str = "qwen2"

class ActionRequest(BaseModel):
    content: str
    model: str = "qwen2"

@router.websocket("/ws")
async def websocket_chat(websocket: WebSocket, payload: dict = Depends(verify_websocket_token)):
    await websocket.accept()
    user_id = payload.get("sub")
    conversation = []
    try:
        while True:
            data = await websocket.receive_json()
            query = data.get("content", "")
            model = data.get("model", "qwen2")
            response = await chatbot_service.generate_response(query)
            await websocket.send_json({
                "role": "assistant",
                "content": response["content"],
                "ragContext": response.get("ragContext", []),
                "model": model
            })
            conversation.append({
                "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                "user_message": query,
                "bot_response": response["content"]
            })
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for user {user_id}")
    except Exception as e:
        await websocket.send_json({"role": "assistant", "content": f"Error: {str(e)}", "ragContext": []})
    finally:
        history_dir = os.path.join(settings.UPLOAD_DIR, user_id, "history")
        os.makedirs(history_dir, exist_ok=True)
        history_file = os.path.join(history_dir, f"conversation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        with open(history_file, 'w', encoding='utf-8') as f:
            json.dump(conversation, f, indent=2)

@router.post("/")
async def chat(request: ChatRequest, user: dict = Depends(verify_token)):
    try:
        response = await chatbot_service.generate_response(request.message)
        return {"content": response["content"], "ragContext": response.get("ragContext", []), "model": request.model}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@router.post("/summarize")
async def summarize_message(request: ActionRequest, user: dict = Depends(verify_token)):
    try:
        prompt = f"Summarize the following text in a concise manner:\n\n{request.content}"
        response = await chatbot_service.generate_response(prompt)
        return {"content": response["content"], "ragContext": response.get("ragContext", []), "model": request.model}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization error: {str(e)}")

@router.post("/humanize")
async def humanize_message(request: ActionRequest, user: dict = Depends(verify_token)):
    try:
        prompt = f"Rewrite the following text in a more conversational and human-like tone:\n\n{request.content}"
        response = await chatbot_service.generate_response(prompt)
        return {"content": response["content"], "ragContext": response.get("ragContext", []), "model": request.model}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Humanization error: {str(e)}")

@router.post("/export")
async def export_message(request: ActionRequest, user: dict = Depends(verify_token)):
    try:
        user_id = user.get("sub")
        export_dir = os.path.join(settings.UPLOAD_DIR, user_id, "exports")
        os.makedirs(export_dir, exist_ok=True)
        export_file = os.path.join(export_dir, f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
        with open(export_file, 'w', encoding='utf-8') as f:
            f.write(request.content)
        return {"message": "Message exported", "file_path": export_file}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")

@router.delete("/clear")
async def clear_conversation(user: dict = Depends(verify_token)):
    try:
        user_id = user.get("sub")
        history_dir = os.path.join(settings.UPLOAD_DIR, user_id, "history")
        if os.path.exists(history_dir):
            shutil.rmtree(history_dir)
        return {"status": "success", "message": "Conversation history cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")

@router.post("/reindex")
async def reindex(background_tasks: BackgroundTasks, user: dict = Depends(verify_token)):
    def reindex_all():
        user_id = user.get("sub")
        user_path = os.path.join(settings.UPLOAD_DIR, user_id)
        if not os.path.exists(user_path):
            print(f"Upload directory not found: {user_path}")
            return

        processed_count = 0
        failed_files = []

        for file_name in os.listdir(user_path):
            file_path = os.path.join(user_path, file_name)
            if not os.path.isfile(file_path) or file_name.startswith('.'):
                continue

            file_id = str(uuid.uuid5(uuid.NAMESPACE_X500, f"{user_id}/{file_name}"))
            temp_dir = os.path.join("./temp", f"reindex_{file_id}")
            os.makedirs(temp_dir, exist_ok=True)

            try:
                extracted_pages = {}
                file_type = "application/pdf" if file_name.lower().endswith(".pdf") else "application/octet-stream"
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