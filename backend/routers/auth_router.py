# backend/routers/auth_router.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from backend.security import create_access_token
from datetime import timedelta

router = APIRouter(prefix="/token", tags=["auth"])

@router.post("/")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # TODO: Implement actual user authentication (e.g., check username/password against database)
    user_id = "user_123"  # Placeholder
    access_token = create_access_token(data={"sub": user_id})
    return {"access_token": access_token, "token_type": "bearer"}