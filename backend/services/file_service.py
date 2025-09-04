# backend/services/file_service.py
import os
import uuid
from typing import Dict, List
from fastapi import UploadFile, HTTPException
from backend.config import get_settings
import tempfile
import fitz #PyMuPDF
from backend.config import get_settings
settings = get_settings()


class PDFTextExtractor:
    @staticmethod
    def extract_text_from_pdf(pdf_path: str, output_dir: str) -> dict:
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

    async def upload_file(self, file: UploadFile, user_id: str) -> Dict:
        if file.content_type not in self.allowed_types:
            raise HTTPException(400, f"Invalid file type. Allowed types: {list(self.allowed_types.keys())}")

        await file.seek(0, 2)
        size = await file.tell()
        if size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(400, f"File exceeds {settings.MAX_FILE_SIZE_MB}MB limit.")
        await file.seek(0)

        upload_dir = os.path.join(settings.UPLOAD_DIR, user_id)
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())

        return {
            "file_id": str(uuid.uuid4()),
            "file_path": file_path,
            "filename": file.filename,
            "size": size,
            "content_type": file.content_type,
            "user_id": user_id
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
