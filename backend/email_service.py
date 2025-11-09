# backend/email_service.py
import logging
from datetime import datetime
from typing import Dict, Any

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Email configuration (should be moved to environment variables)
SMTP_SERVER = "smtp.gmail.com"  # Or your SMTP server
SMTP_PORT = 587
SMTP_USERNAME = "your-email@gmail.com"  # Your email
SMTP_PASSWORD = "your-app-password"  # Your app password for Gmail
FRONTEND_URL = "http://localhost:3000"  # Your frontend URL


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """
    Send an email using SMTP.
    """
    try:
        # Create message
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = SMTP_USERNAME
        message["To"] = to_email
        
        # Attach HTML body
        html_part = MIMEText(html_body, "html")
        message.attach(html_part)
        
        # Connect to SMTP server and send email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SMTP_USERNAME, to_email, message.as_string())
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}", exc_info=True)
        return False


def send_verification_email(to_email: str, username: str, token: str) -> bool:
    """
    Send email verification link to user.
    """
    verification_url = f"{FRONTEND_URL}/verify-email?token={token}"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Email Verification</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #f8f9fa; padding: 20px; text-align: center; }}
            .content {{ padding: 20px; }}
            .button {{ display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }}
            .footer {{ background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Welcome to DocAA!</h1>
            </div>
            <div class="content">
                <p>Hi {username},</p>
                <p>Thank you for registering with DocAA. To complete your registration, please verify your email address by clicking the button below:</p>
                <p style="text-align: center; margin: 30px 0;">
                    <a href="{verification_url}" class="button">Verify Email</a>
                </p>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 5px;">
                    {verification_url}
                </p>
                <p>This link will expire in 24 hours.</p>
            </div>
            <div class="footer">
                <p>If you didn't create an account with DocAA, you can safely ignore this email.</p>
                <p>&copy; {datetime.now().year} DocAA. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(to_email, "Verify your DocAA account", html_body)


def send_password_reset_email(to_email: str, username: str, token: str) -> bool:
    """
    Send password reset link to user.
    """
    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Password Reset</title>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background-color: #f8f9fa; padding: 20px; text-align: center; }}
            .content {{ padding: 20px; }}
            .button {{ display: inline-block; padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; }}
            .footer {{ background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Password Reset</h1>
            </div>
            <div class="content">
                <p>Hi {username},</p>
                <p>We received a request to reset your password for your DocAA account. Click the button below to reset your password:</p>
                <p style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" class="button">Reset Password</a>
                </p>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 5px;">
                    {reset_url}
                </p>
                <p>This link will expire in 1 hour.</p>
                <p>If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
            <div class="footer">
                <p>&copy; {datetime.now().year} DocAA. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(to_email, "Reset your DocAA password", html_body)