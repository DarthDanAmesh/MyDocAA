# backend/main.py
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from fastapi.openapi.utils import get_openapi

# Routers
from backend.routers.chat_router import router as chat_router
from backend.routers.file_router import router as file_router
from backend.routers.auth_router import router as auth_router

# DB
from backend.db import Base, engine
from backend.models.user_model import User
from backend.models.file_model import FileRecord

# Create tables
Base.metadata.create_all(bind=engine)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# FastAPI app
app = FastAPI(title="DocAA", version="0.2.0")

# Custom OpenAPI schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title="DocAA",
        version="0.2.0",
        description="Document Assistant API",
        routes=app.routes,
    )
    
    # Add security scheme
    openapi_schema["components"]["securitySchemes"] = {
        "OAuth2PasswordBearer": {
            "type": "oauth2",
            "flows": {
                "password": {
                    "tokenUrl": "/api/token",
                    "scopes": {}
                }
            }
        }
    }
    
    # Add security requirement to protected routes
    for path in openapi_schema["paths"]:
        if path.startswith("/api/files") or path == "/api/users/me":
            for method in openapi_schema["paths"][path]:
                if "security" not in openapi_schema["paths"][path][method]:
                    openapi_schema["paths"][path][method]["security"] = [{"OAuth2PasswordBearer": []}]
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Attach limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(chat_router, prefix="/api")  
app.include_router(file_router, prefix="/api")

# Print all routes for debugging
print("\nAll registered routes:")
for route in app.routes:
    if hasattr(route, 'path') and hasattr(route, 'methods'):
        print(f"{route.methods} {route.path}")

# Healthcheck
@app.get("/", tags=["health"])
async def health():
    return {"status": "running"}