# backend/services/knowledge_base_service.py
import os
import uuid
from datetime import datetime
import chromadb
from chromadb.utils import embedding_functions
from chromadb.config import Settings
from typing import Dict, List, Optional, Any
import logging
from config import get_settings
from user_model import User  # Import User model
from sqlalchemy.orm import Session  # Import Session

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
    
    def index_documents(
        self, 
        document_paths: Dict[str, str], 
        document_name: str, 
        file_id: str,
        user_id: Optional[str] = None
    ):
        """
        Index documents in the knowledge base.
        
        Args:
            document_paths: Dictionary mapping page names to file paths
            document_name: Name of the document
            file_id: ID of the file
            user_id: Optional ID of the user who owns the document
        """
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
            
            # Create metadata dictionary
            metadata = {
                "source": document_name,
                "page": page_name,
                "file_path": file_path,
                "file_id": file_id,  # Link to file_id for deletion
                "indexed_at": datetime.now().isoformat()
            }
            
            # Add user_id to metadata if provided
            if user_id:
                metadata["user_id"] = user_id
                
            # Add tags
            metadata["tags"] = self.generate_tags(text)
            
            metadatas.append(metadata)
        
        if documents:
            self.collection.add(ids=ids, documents=documents, metadatas=metadatas)
            logger.info(f"Indexed {len(documents)} pages for file_id: {file_id}")
        else:
            logger.warning("No non-empty documents to index.")
    
    def generate_tags(self, text: str) -> List[str]:
        """
        Generate tags for a text document.
        
        Args:
            text: The text to generate tags for
            
        Returns:
            List of tags
        """
        # Simple keyword extraction as a placeholder
        # In a real implementation, you might use spaCy NER or more advanced NLP techniques
        words = text.lower().split()
        # Filter out common words and short words
        filtered_words = [word for word in words if len(word) > 3 and word not in [
            "the", "and", "that", "have", "for", "not", "with", "you", "this", "but", "his", "from", "they", "she", "her", "been", "than", "its", "were", "said", "each", "which", "their", "time", "will", "about", "if", "up", "out", "many", "then", "them", "these", "so", "some", "her", "would", "make", "like", "into", "him", "has", "two", "more", "very", "what", "know", "just", "first", "get", "over", "think", "also", "your", "work", "life", "only", "can", "still", "should", "after"
        ]]
        
        # Get unique words and return top 10 as tags
        unique_words = list(set(filtered_words))
        return unique_words[:10] if unique_words else ["document", "text"]
    
    def search(
        self, 
        query: str, 
        user_id: Optional[str] = None, 
        n_results: int = 5,
        where_filter: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for documents relevant to the query.
        
        Args:
            query: The search query
            user_id: Optional user ID to filter results by user
            n_results: Maximum number of results to return
            where_filter: Additional filter conditions
            
        Returns:
            List of relevant documents with metadata
        """
        try:
            # Build filter conditions
            filter_conditions = {}
            
            # Add user_id filter if provided
            if user_id:
                filter_conditions["user_id"] = user_id
                
            # Add additional filter conditions if provided
            if where_filter:
                filter_conditions.update(where_filter)
                
            # Query the knowledge base
            results = self.collection.query(
                query_texts=[query],
                where=filter_conditions if filter_conditions else None,
                n_results=n_results
            )
            
            # Format results
            formatted_results = []
            if results and "documents" in results and results["documents"]:
                for i, doc in enumerate(results["documents"][0]):
                    formatted_result = {
                        "text": doc,
                        "metadata": results["metadatas"][0][i] if results.get("metadatas") else {},
                        "relevance_score": results["distances"][0][i] if results.get("distances") else 0.0
                    }
                    formatted_results.append(formatted_result)
            
            return formatted_results
        except Exception as e:
            logger.error(f"Search error: {e}")
            return []
    
    def delete_by_file_id(self, file_id: str, user_id: Optional[str] = None):
        """
        Delete all documents associated with a file_id.
        
        Args:
            file_id: The ID of the file
            user_id: Optional user ID for additional verification
        """
        try:
            # Build filter conditions
            filter_conditions = {"file_id": file_id}
            
            # Add user_id filter if provided for additional security
            if user_id:
                filter_conditions["user_id"] = user_id
                
            # Query documents with matching file_id
            results = self.collection.query(
                query_texts=[""],  # Empty query to get all documents
                where=filter_conditions,
                n_results=settings.NUMBER_OF_EXPECTED_MAX_DOCUMENTS
            )
            
            # Delete the documents
            if results and "ids" in results and results["ids"]:
                ids = results["ids"][0]
                if ids:
                    self.collection.delete(ids=ids)
                    logger.info(f"Deleted {len(ids)} documents for file_id: {file_id}")
                else:
                    logger.warning(f"No documents found for file_id: {file_id}")
            else:
                logger.warning(f"No documents found for file_id: {file_id}")
        except Exception as e:
            logger.error(f"Failed to delete documents for file_id {file_id}: {e}")
    
    def delete_by_user_id(self, user_id: str):
        """
        Delete all documents associated with a user_id.
        
        Args:
            user_id: The ID of the user
        """
        try:
            # Query documents with matching user_id
            results = self.collection.query(
                query_texts=[""],  # Empty query to get all documents
                where={"user_id": user_id},
                n_results=settings.NUMBER_OF_EXPECTED_MAX_DOCUMENTS
            )
            
            # Delete the documents
            if results and "ids" in results and results["ids"]:
                ids = results["ids"][0]
                if ids:
                    self.collection.delete(ids=ids)
                    logger.info(f"Deleted {len(ids)} documents for user_id: {user_id}")
                else:
                    logger.warning(f"No documents found for user_id: {user_id}")
            else:
                logger.warning(f"No documents found for user_id: {user_id}")
        except Exception as e:
            logger.error(f"Failed to delete documents for user_id {user_id}: {e}")
    
    def get_files_by_user(self, user_id: str) -> List[str]:
        """
        Get all file_ids associated with a user.
        
        Args:
            user_id: The ID of the user
            
        Returns:
            List of file_ids
        """
        try:
            # Query documents with matching user_id
            results = self.collection.query(
                query_texts=[""],  # Empty query to get all documents
                where={"user_id": user_id},
                n_results=settings.NUMBER_OF_EXPECTED_MAX_DOCUMENTS,
                include=["metadatas"]
            )
            
            # Extract unique file_ids
            file_ids = set()
            if results and "metadatas" in results and results["metadatas"]:
                for metadata in results["metadatas"][0]:
                    if "file_id" in metadata:
                        file_ids.add(metadata["file_id"])
            
            return list(file_ids)
        except Exception as e:
            logger.error(f"Failed to get files for user_id {user_id}: {e}")
            return []
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the knowledge base.
        
        Returns:
            Dictionary with statistics
        """
        try:
            # Get total number of documents
            count = self.collection.count()
            
            # Get number of unique files
            results = self.collection.query(
                query_texts=[""],  # Empty query to get all documents
                n_results=settings.NUMBER_OF_EXPECTED_MAX_DOCUMENTS,
                include=["metadatas"]
            )
            
            unique_files = set()
            unique_users = set()
            
            if results and "metadatas" in results and results["metadatas"]:
                for metadata in results["metadatas"][0]:
                    if "file_id" in metadata:
                        unique_files.add(metadata["file_id"])
                    if "user_id" in metadata:
                        unique_users.add(metadata["user_id"])
            
            return {
                "total_documents": count,
                "unique_files": len(unique_files),
                "unique_users": len(unique_users)
            }
        except Exception as e:
            logger.error(f"Failed to get knowledge base stats: {e}")
            return {"total_documents": 0, "unique_files": 0, "unique_users": 0}