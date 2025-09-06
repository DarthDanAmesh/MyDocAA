# backend/main.py
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

# Routers
from backend.routers.chat_router import router as chat_router
from backend.routers.file_router import router as file_router
from backend.routers.auth_router import router as auth_router

# DB
from backend.db import Base, engine
from backend.models.user_model import User
from backend.models.file_model import FileRecord

# Create tables (from models: backend/models/*)
Base.metadata.create_all(bind=engine)

# --- Rate limiter ---
limiter = Limiter(key_func=get_remote_address)

# --- FastAPI app ---
app = FastAPI(title="DocAA", version="0.2.0")

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# --- Routers ---
app.include_router(chat_router)   # has the prefix: /api/chat
app.include_router(file_router)   # has the prefix: /api/files
app.include_router(auth_router)   # has the prefix: /token

# --- Healthcheck ---
@app.get("/", tags=["health"])
async def health():
    return {"status": "running"}
