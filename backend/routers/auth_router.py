# backend/routers/auth_router.py

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

# Use relative imports
from ..db import get_db
from ..models.user_model import User
from ..security import (
    verify_password, 
    verify_token,
    get_password_hash, 
    create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["authentication"])


class UserCreate(BaseModel):
    """Schema for user registration."""
    username: str
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Schema for user response."""
    id: int
    username: str
    email: str
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    """Schema for access token response."""
    access_token: str
    token_type: str


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user.
    
    - **username**: Unique username for the user
    - **email**: Valid email address (must be unique)
    - **password**: User password (will be hashed)
    """
    logger.info(f"Registration attempt for email: {user.email}, username: {user.username}")
    
    try:
        # Check if email already exists
        logger.info("Checking for existing user by email...")
        existing_user = db.query(User).filter(User.email == user.email).first()
        if existing_user:
            logger.warning(f"Registration failed: Email {user.email} already registered.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Check if username already exists
        logger.info("Checking for existing user by username...")
        existing_user = db.query(User).filter(User.username == user.username).first()
        if existing_user:
            logger.warning(f"Registration failed: Username {user.username} already taken.")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        
        # Create new user
        logger.info("Hashing password...")
        hashed_password = get_password_hash(user.password)
        
        logger.info("Creating new user object...")
        new_user = User(
            username=user.username,
            email=user.email,
            hashed_password=hashed_password
        )
        
        logger.info("Adding user to database session...")
        db.add(new_user)
        
        logger.info("Committing transaction...")
        db.commit()
        
        logger.info("Refreshing user object...")
        db.refresh(new_user)
        
        logger.info(f"User {new_user.username} registered successfully with ID: {new_user.id}")
        return new_user

    except HTTPException:
        # Re-raise HTTP exceptions (like 400 bad request)
        db.rollback()
        raise
    except Exception as e:
        # Rollback on any error
        db.rollback()
        logger.error(f"Unexpected error during registration: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An internal server error occurred during registration: {str(e)}"
        )


@router.post("/token", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    """
    Login with username and password to receive an access token.
    
    Uses OAuth2 password flow (form data with username and password).
    """
    logger.info(f"Login attempt for username: {form_data.username}")
    
    try:
        # Authenticate user
        user = db.query(User).filter(User.username == form_data.username).first()
        
        if not user:
            logger.warning(f"Login failed: User {form_data.username} not found")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not verify_password(form_data.password, user.hashed_password):
            logger.warning(f"Login failed: Invalid password for user {form_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Create access token
        logger.info(f"Creating access token for user: {user.username}")
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=access_token_expires
        )
        
        logger.info(f"User {user.username} logged in successfully")
        return {"access_token": access_token, "token_type": "bearer"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during login: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal server error occurred during login"
        )


@router.get("/users/me", response_model=UserResponse)
def get_current_user(user: User = Depends(verify_token)):
    """
    Get the currently authenticated user's information.
    
    Requires a valid access token in the Authorization header.
    """
    logger.info(f"Fetching current user info for: {user.username}")
    return user