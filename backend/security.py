# backend/security.py

from fastapi import Depends, HTTPException, status, WebSocket
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
import os
from dotenv import load_dotenv
from pathlib import Path

# 👉 Explicitly define the project root and load .env
ROOT_DIR = Path(__file__).resolve().parent  # points to 'ai-assistant/backend'
#print("parent: ",ROOT_DIR)
#ROOT_DIR = Path(__file__).resolve().parent.parent  #if you want it to point to 'ai-assistant/ ; and ROOT_DIR = Path(__file__).resolve().parent .parent.parent etc etc
DOTENV_PATH = ROOT_DIR / ".env"

# Load environment variables from explicit path
load_dotenv(DOTENV_PATH)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY is not set in environment variables")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def verify_websocket_token(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        await websocket.close(code=4001, reason="Invalid or expired token")
        raise HTTPException(status_code=401, detail="Invalid or expired token")