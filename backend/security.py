# backend/security.py

from fastapi import Depends, HTTPException, status, WebSocket, Request
from fastapi.security import OAuth2PasswordBearer, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from user_model import User
from db import get_db
from passlib.context import CryptContext
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


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto") # password hashing

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token", auto_error=False)
security = HTTPBearer(auto_error=False)


def verify_password(plain_password:str, hashed_password:str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password:str)-> str:
    return pwd_context.hash(password)


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Try to get token from Authorization header (Bearer scheme)
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    # If no token found, raise exception
    if not token:
        raise credentials_exception
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as e:
        print(f"JWT Error: {str(e)}")
        raise credentials_exception
    
    try:
        user_id_int = int(user_id)
    except ValueError:
        raise credentials_exception
    
    # Fetch the user from the database
    user = db.query(User).filter(User.id == user_id_int).first()
    if user is None:
        raise credentials_exception
    
    return user  # Return the full 
    

async def verify_websocket_token(websocket: WebSocket, db: Session = Depends(get_db)):
    token = websocket.query_params.get("token")
    print(f"WebSocket token received: {token}")

    if not token:
        await websocket.close(code=4001, reason="Missing token")
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        print(f"Decoded JWT payload: {payload}")
        user_id: str = payload.get("sub")
        if user_id is None:
            await websocket.close(code=4001, reason="Invalid token: user_id not found")
            raise HTTPException(status_code=401, detail="Invalid token: user_id not found")

        user = db.query(User).filter(User.id == int(user_id)).first()
        if user is None:
            await websocket.close(code=4001, reason="User not found")
            raise HTTPException(status_code=401, detail="User not found")

        print(f"Authenticated user from WebSocket: {user.username}")
        return user

    except JWTError as e:
        print(f"JWT decode error: {str(e)}")
        await websocket.close(code=4001, reason="Invalid or expired token")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
