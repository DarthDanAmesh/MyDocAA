# app/main.py
from fastapi import Depends, FastAPI, APIRouter
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.routers.file_router import router as file_router #ocr_router, chat_router, speech_router
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

app = FastAPI()

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.include_router(file_router, prefix="/api/files", tags=["files"])
#app.include_router(ocr_router, prefix="/api/ocr", tags=["ocr"])
#app.include_router(chat_router, prefix="/api/chat", tags=["chat"])
#app.include_router(speech_router, prefix="/api/speech", tags=["speech"])

@app.get("/")
def health():
    return {"status": "running"}

