# backend/services/file_service.py
import os
import uuid
from typing import Dict, List, Optional
from fastapi import UploadFile, HTTPException
from backend.config import get_settings
import tempfile
import fitz #PyMuPDF
from backend.models.user_model import User  # Import User model
from backend.models.file_model import FileRecord  # Import FileRecord model
from sqlalchemy.orm import Session  # Import Session
from backend.db import get_db  # Import get_db

settings = get_settings()


class PDFTextExtractor:
    @staticmethod
    def extract_text_from_pdf(pdf_path: str, output_dir: str) -> Dict[str, str]:
        os.makedirs(output_dir, exist_ok=True)
        pdf_document = fitz.open(pdf_path)
        extracted_pages = {}

        for page_num in range(len(pdf_document)):
            page = pdf_document.load_page(page_num)
            text = page.get_text()
            txt_file_path = os.path.join(output_dir, f"page_{page_num + 1}.txt")
            with open(txt_file_path, "w", encoding="utf-8") as f:
                f.write(text)
            extracted_pages[f"page_{page_num + 1}"] = txt_file_path

        pdf_document.close()
        return extracted_pages
    

class AdvancedIngestionService:
    def __init__(self):
        self.allowed_types = {
            "application/pdf": ".pdf",
            "image/png": ".png",
            "image/jpeg": ".jpeg",
            "image/jpg": ".jpg",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
            "application/vnd.ms-excel": ".xls"
        }

    async def upload_file(self, file: UploadFile, user: User, db: Session) -> Dict:
        """
        Upload a file and create a database record for it.
        
        Args:
            file: The file to upload
            user: The user uploading the file (User object)
            db: Database session
            
        Returns:
            Dictionary with file information
        """
        if file.content_type not in self.allowed_types:
            raise HTTPException(400, f"Invalid file type. Allowed types: {list(self.allowed_types.keys())}")

        await file.seek(0, 2)
        size = await file.tell()
        if size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(400, f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit.")
        await file.seek(0)

        # Create user-specific directory
        user_id_str = str(user.id)
        upload_dir = os.path.join(settings.UPLOAD_DIR, user_id_str)
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename to avoid conflicts
        file_id = str(uuid.uuid4())
        file_extension = self.allowed_types.get(file.content_type, "")
        safe_filename = f"{file_id}{file_extension}"
        file_path = os.path.join(upload_dir, safe_filename)
        
        # Save the file
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())

        # Create and return file information
        return {
            "file_id": file_id,
            "file_path": file_path,
            "filename": file.filename,  # Keep original filename for display
            "safe_filename": safe_filename,  # Include safe filename for reference
            "size": size,
            "content_type": file.content_type,
            "user_id": user_id_str
        }

    async def process_document(self, file_path: str, file_type: str) -> List[str]:
        if file_type not in self.allowed_types:
            raise HTTPException(400, "Unsupported file type for processing.")

        extension = self.allowed_types[file_type]
        temp_dir = tempfile.mkdtemp()

        try:
            if file_type == "application/pdf":
                pages = PDFTextExtractor.extract_text_from_pdf(file_path, temp_dir)
                return [open(path, "r", encoding="utf-8").read() for path in pages.values()]
            else:
                # Existing logic for other file types
                from llama_index.readers.docling import DoclingReader
                from llama_index.core import SimpleDirectoryReader
                temp_path = os.path.join(temp_dir, os.path.basename(file_path))
                with open(file_path, "rb") as src, open(temp_path, "wb") as dst:
                    dst.write(src.read())
                loader = SimpleDirectoryReader(
                    input_dir=temp_dir,
                    file_extractor={extension: DoclingReader()}
                )
                documents = loader.load_data()
                return [doc.text for doc in documents]
        except Exception as e:
            raise HTTPException(500, f"Error processing document: {str(e)}")
        finally:
            # Clean up temp directory
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)

    async def process_pdf(self, file_path: str) -> List[str]:
        return await self.process_document(file_path, "application/pdf")

    async def process_excel(self, file_path: str) -> List[str]:
        return await self.process_document(file_path, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    async def process_image(self, file_path: str) -> List[str]:
        return await self.process_document(file_path, "image/png")
    
    async def get_user_files(self, user: User, db: Session) -> List[FileRecord]:
        """
        Get all files for a specific user.
        
        Args:
            user: The user to get files for
            db: Database session
            
        Returns:
            List of FileRecord objects
        """
        return db.query(FileRecord).filter(FileRecord.user_id == user.id).all()
    
    async def get_file_by_id(self, file_id: str, user: User, db: Session) -> Optional[FileRecord]:
        """
        Get a specific file by ID for a user.
        
        Args:
            file_id: The ID of the file
            user: The user who owns the file
            db: Database session
            
        Returns:
            FileRecord object or None if not found
        """
        return db.query(FileRecord).filter(
            FileRecord.file_id == file_id, 
            FileRecord.user_id == user.id
        ).first()
    
    async def delete_file(self, file_id: str, user: User, db: Session) -> bool:
        """
        Delete a file and its database record.
        
        Args:
            file_id: The ID of the file to delete
            user: The user who owns the file
            db: Database session
            
        Returns:
            True if successful, False otherwise
        """
        file_record = await self.get_file_by_id(file_id, user, db)
        if not file_record:
            return False
            
        # Delete the file from disk
        if os.path.exists(file_record.file_path):
            os.remove(file_record.file_path)
        
        # Delete the database record
        db.delete(file_record)
        db.commit()
        
        return True