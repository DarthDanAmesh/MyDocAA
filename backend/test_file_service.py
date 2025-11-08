# tests/test_file_service.py
import pytest
from file_service import AdvancedIngestionService
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from llama_index.core import SimpleDirectoryReader
import os

@pytest.mark.asyncio
async def test_file_upload_validation():
    file = AsyncMock()
    file.content_type = "application/pdf"
    file.filename = "test.pdf"
    file.seek = AsyncMock()
    file.tell = AsyncMock(return_value=7)
    file.read = AsyncMock(return_value=b"content")

    service = AdvancedIngestionService()
    result = await service.upload_file(file, "user_123")

    assert result["filename"] == "test.pdf"
    assert result["user_id"] == "user_123"
    assert result["file_path"].endswith("test.pdf")
    assert result["content_type"] == "application/pdf"
    assert result["size"] == 7

@pytest.mark.asyncio
async def test_upload_rejects_invalid_types():
    file = AsyncMock()
    file.content_type = "text/plain"
    file.filename = "test.txt"
    file.read = AsyncMock(return_value=b"content")
    file.file.seek = AsyncMock(side_effect=[0, 7, 0])
    file.file.tell = AsyncMock(return_value=7)

    service = AdvancedIngestionService()
    with pytest.raises(HTTPException) as exc:
        await service.upload_file(file, "user_123")
    assert exc.value.status_code == 400
    assert "Invalid file type" in exc.value.detail

@pytest.mark.asyncio
async def test_upload_rejects_large_files():
    file = AsyncMock()
    file.content_type = "application/pdf"
    file.filename = "test.pdf"
    file.seek = AsyncMock()
    file.tell = AsyncMock(return_value=51 * 1024 * 1024)# 51MB
    file.read = AsyncMock(return_value=b"x" * (51*1024 * 1024))#simulate large file bytes

    service = AdvancedIngestionService()
    with pytest.raises(HTTPException) as exc:
        await service.upload_file(file, "user_123")
    assert exc.value.status_code == 400
    assert "File exceeds 5MB limit" in exc.value.detail

@pytest.mark.asyncio
async def test_pdf_chunking():
    service = AdvancedIngestionService()
    with patch("llama_index.core.SimpleDirectoryReader") as mock_loader:
        mock_loader.return_value.load_data.return_value = [
            type("Document", (), {"text": "Sample PDF content"})()
        ]
        process_chunk = await service.process_pdf("tests/samples/test.pdf")
    assert len(process_chunk) == 1
    assert process_chunk[0] == "Sample PDF content"

@pytest.mark.asyncio
async def test_excel_processing():
    service = AdvancedIngestionService()
    with patch("llama_index.core.SimpleDirectoryReader") as mock_loader:
        mock_loader.return_value.load_data.return_value = [
            type("Document", (), {"text": "Sample Excel content"})()
        ]
        chunks = await service.process_excel("tests/samples/test.xlsx")
    assert len(chunks) == 1
    assert chunks[0] == "Sample Excel content"

@pytest.mark.asyncio
async def test_multiple_file_type_support():
    service = AdvancedIngestionService()
    supported_types = [
        "application/pdf",
        "image/png",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]
    assert set(service.allowed_types.keys()) >= set(supported_types)

@pytest.mark.asyncio
async def test_document_processing_error_handling():
    service = AdvancedIngestionService()
    with patch("llama_index.core.SimpleDirectoryReader") as mock_loader:
        mock_loader.return_value.load_data.side_effect = Exception("Processing error")
        with pytest.raises(HTTPException) as exc:
            await service.process_document("tests/samples/test.pdf", "application/pdf")
        assert exc.value.status_code == 500
        assert "Error processing document" in exc.value.detail