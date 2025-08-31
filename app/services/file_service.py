# app/services/file_service.py
import os
from typing import Dict, List
from fastapi import UploadFile, HTTPException
from llama_index.readers.docling import DoclingReader
from llama_index.core import SimpleDirectoryReader
import tempfile

class AdvancedIngestionService:
    def __init__(self):
        self.reader = DoclingReader()
        self.allowed_types = {
            "application/pdf": ".pdf",
            "image/png": ".png",
            "image/jpeg": ".jpeg",
            "image/jpg": ".jpg",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
            "application/vnd.ms-excel": ".xls"
        }

    async def upload_file(self, file: UploadFile, user_id: str) -> Dict:
        # Validate file type
        if file.content_type not in self.allowed_types:
            raise HTTPException(400, f"Invalid file type. Allowed types: {list(self.allowed_types.keys())}")

        # Validate file size
        await file.seek(0, 2) #mov eof
        size = await file.tell() #get current position (file size)
        if size > 5 * 1024 * 1024:
            raise HTTPException(400, "File exceeds 5MB limit.")
        await file.seek(0) #reset to beginning

        # Save file
        upload_dir = f"uploads/{user_id}"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())

        return {
            "file_path": file_path,
            "filename": file.filename,
            "size": size,
            "content_type": file.content_type,
            "user_id": user_id
        }

    async def process_document(self, file_path: str, file_type: str) -> List[str]:
        if file_type not in self.allowed_types:
            raise HTTPException(400, "Unsupported file type for processing.")

        extension = self.allowed_types.get(file_type, ".pdf")
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = os.path.join(temp_dir, os.path.basename(file_path))
            with open(file_path, "rb") as src, open(temp_path, "wb") as dst:
                dst.write(src.read())

            try:
                loader = SimpleDirectoryReader(
                    input_dir=temp_dir,
                    file_extractor={extension: self.reader}
                )
                documents = loader.load_data()
                return [doc.text for doc in documents]
            except Exception as e:
                raise HTTPException(500, f"Error processing document: {str(e)}")

    async def process_pdf(self, file_path: str) -> List[str]:
        return await self.process_document(file_path, "application/pdf")

    async def process_excel(self, file_path: str) -> List[str]:
        return await self.process_document(file_path, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    async def process_image(self, file_path: str) -> List[str]:
        # For images, we might want to apply OCR (to be integrated in Phase 2)
        #why is only png image here?
        return await self.process_document(file_path, "image/png")