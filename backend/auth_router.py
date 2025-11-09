# backend/routers/auth_router.py
import logging
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, field_validator

from db import get_db
from user_model import User
from security import (
    verify_password, 
    verify_token,
    get_password_hash, 
    create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from email_service import send_verification_email, send_password_reset_email

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["authentication"])


class UserCreate(BaseModel):
    """Schema for user registration."""
    username: str
    email: EmailStr
    password: str

    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if len(v) < 3:
            raise ValueError('Username must be at least 3 characters long')
        if len(v) > 20:
            raise ValueError('Username must be less than 20 characters long')
        return v

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v


class UserResponse(BaseModel):
    """Schema for user response."""
    id: int
    username: str
    email: str
    verified: bool
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    """Schema for access token response."""
    access_token: str
    token_type: str


class VerificationRequest(BaseModel):
    """Schema for verification email request."""
    email: EmailStr


class PasswordResetRequest(BaseModel):
    """Schema for password reset request."""
    email: EmailStr


class PasswordReset(BaseModel):
    """Schema for password reset."""
    token: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
def register(
    user: UserCreate, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Register a new user and send verification email.
    
    - **username**: Unique username for user
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
        
        # Create new user (unverified)
        logger.info("Hashing password...")
        hashed_password = get_password_hash(user.password)
        
        logger.info("Creating new user object...")
        new_user = User(
            username=user.username,
            email=user.email,
            hashed_password=hashed_password,
            verified=False,
            verification_token=str(uuid.uuid4()),
            verification_token_expires=datetime.utcnow() + timedelta(hours=24)
        )
        
        logger.info("Adding user to database session...")
        db.add(new_user)
        
        logger.info("Committing transaction...")
        db.commit()
        
        logger.info("Refreshing user object...")
        db.refresh(new_user)
        
        # Send verification email in background
        background_tasks.add_task(
            send_verification_email,
            new_user.email,
            new_user.username,
            new_user.verification_token
        )
        
        logger.info(f"User {new_user.username} registered successfully with ID: {new_user.id}")
        return {
            "message": "Registration successful. Please check your email for verification.",
            "user_id": new_user.id
        }

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


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    """
    Verify user email with verification token.
    """
    try:
        user = db.query(User).filter(User.verification_token == token).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification token"
            )
        
        if user.verification_token_expires < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification token has expired"
            )
        
        # Mark user as verified and clear verification token
        user.verified = True
        user.verification_token = None
        user.verification_token_expires = None
        
        db.commit()
        
        return {"message": "Email verified successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying email: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during email verification"
        )


@router.post("/resend-verification")
def resend_verification(
    request: VerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Resend verification email.
    """
    try:
        user = db.query(User).filter(User.email == request.email).first()
        
        if not user:
            # Don't reveal whether email exists
            return {"message": "If the email exists, a verification link has been sent"}
        
        if user.verified:
            return {"message": "Email is already verified"}
        
        # Generate new verification token
        user.verification_token = str(uuid.uuid4())
        user.verification_token_expires = datetime.utcnow() + timedelta(hours=24)
        
        db.commit()
        
        # Send verification email in background
        background_tasks.add_task(
            send_verification_email,
            user.email,
            user.username,
            user.verification_token
        )
        
        return {"message": "Verification email sent successfully"}
        
    except Exception as e:
        logger.error(f"Error resending verification email: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resend verification email"
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
        
        if not user.verified:
            logger.warning(f"Login failed: User {form_data.username} not verified")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email not verified. Please check your email for verification link.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Create access token
        access_token = create_access_token(data={"sub": user.username})
        
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


@router.post("/request-password-reset")
def request_password_reset(
    request: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Request a password reset email.
    """
    try:
        user = db.query(User).filter(User.email == request.email).first()
        
        if not user:
            # Don't reveal whether email exists
            return {"message": "If the email exists, a password reset link has been sent"}
        
        # Generate password reset token
        reset_token = str(uuid.uuid4())
        user.reset_token = reset_token
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        
        db.commit()
        
        # Send password reset email in background
        background_tasks.add_task(
            send_password_reset_email,
            user.email,
            user.username,
            reset_token
        )
        
        return {"message": "Password reset email sent successfully"}
        
    except Exception as e:
        logger.error(f"Error requesting password reset: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send password reset email"
        )


@router.post("/reset-password")
def reset_password(
    reset_data: PasswordReset,
    db: Session = Depends(get_db)
):
    """
    Reset password using reset token.
    """
    try:
        user = db.query(User).filter(User.reset_token == reset_data.token).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid reset token"
            )
        
        if user.reset_token_expires < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset token has expired"
            )
        
        # Update password and clear reset token
        user.hashed_password = get_password_hash(reset_data.new_password)
        user.reset_token = None
        user.reset_token_expires = None
        
        db.commit()
        
        return {"message": "Password reset successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting password: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during password reset"
        )


@router.get("/users/me", response_model=UserResponse)
def get_current_user(user: User = Depends(verify_token)):
    """
    Get currently authenticated user's information.
    
    Requires a valid access token in the Authorization header.
    """
    logger.info(f"Fetching current user info for: {user.username}")
    return user


@router.post("/logout")
def logout():
    """
    Logout user (client-side token removal).
    """
    return {"message": "Successfully logged out"}