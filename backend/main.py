# app/main.py
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

# Routers
from backend.routers.file_router import router as file_router

# --- Rate limiter ---
limiter = Limiter(key_func=get_remote_address)

# --- FastAPI app ---
app = FastAPI(title="DocAA", version="0.2.0")

app.add_middleware(CORSMiddleware,
                   allow_origins=["http://localhost:3000"], # next js default
                   allow_credentials=True,
                   allow_methods=["*"],
                   allow_headers=["*"]
                   )



# Attach limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# --- Routers ---
app.include_router(file_router, prefix="/api/files", tags=["files"])

# --- Healthcheck ---
@app.get("/", tags=["health"])
async def health():
    return {"status": "running"}
