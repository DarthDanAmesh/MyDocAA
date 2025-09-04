# backend/services/knowledge_base_service.py
import os
import uuid
from datetime import datetime
import chromadb
from chromadb.utils import embedding_functions
from chromadb.config import Settings
from typing import Dict, List, Optional
import logging
from backend.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class KnowledgeBaseIndexer:
    def __init__(
        self,
        collection_name: str = "documents",
        ollama_model: str = settings.EMBEDDING_MODEL,
        persist_dir: str = settings.CHROMA_DB_DIR
    ):
        self.collection_name = collection_name
        self.persist_dir = persist_dir
        self.ollama_model = ollama_model
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.embedding_fn = embedding_functions.OllamaEmbeddingFunction(
            url=settings.OLLAMA_URL + "/api/embeddings",
            model_name=ollama_model
        )
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            embedding_function=self.embedding_fn
        )
        logger.info(f"Initialized ChromaDB collection. The collection name is: {collection_name}")

    def index_documents(self, document_paths: Dict[str, str], document_name: str, file_id: str):
        ids = []
        documents = []
        metadatas = []

        for page_name, file_path in document_paths.items():
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read().strip()
            if not text:
                continue

            doc_id = str(uuid.uuid4())
            ids.append(doc_id)
            documents.append(text)
            metadatas.append({
                "source": document_name,
                "page": page_name,
                "file_path": file_path,
                "file_id": file_id,  # Link to file_id for deletion
                "tags": self.generate_tags(text)  # Add tagging logic
            })

        if documents:
            self.collection.add(ids=ids, documents=documents, metadatas=metadatas)
            logger.info(f"Indexed {len(documents)} pages for file_id: {file_id}")
        else:
            logger.warning("No non-empty documents to index.")

    def generate_tags(self, text: str) -> List[str]:
        # TODO: Implement tagging logic (e.g., spaCy NER or keyword extraction)
        # Example placeholder: return dummy tags
        return ["document", "sample"]

    def search(self, query: str, n_results: int = 3) -> List[Dict]:
        try:
            results = self.collection.query(
                query_texts=[query],
                n_results=n_results,
                include=["documents", "metadatas", "distances"]
            )
            retrieved = []
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0]
            ):
                retrieved.append({
                    "text": doc,
                    "metadata": meta,
                    "relevance_score": 1 / (1 + dist)
                })
            return retrieved
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []

    def delete_by_file_id(self, file_id: str):
        try:
            # Query documents with matching file_id
            results = self.collection.query(
                query_texts=[""],  # Empty query to get all documents
                where={"file_id": file_id},
                n_results= settings.NUMBER_OF_EXPECTED_MAX_DOCUMENTS  # Adjust based on NUMBER_OF_EXPECTED_MAX_DOCUMENTS 
            )
            ids = results.get("ids", [[]])[0]
            if ids:
                self.collection.delete(ids=ids)
                logger.info(f"Deleted {len(ids)} documents for file_id: {file_id}")
            else:
                logger.warning(f"No documents found for file_id: {file_id}")
        except Exception as e:
            logger.error(f"Failed to delete documents for file_id {file_id}: {e}")