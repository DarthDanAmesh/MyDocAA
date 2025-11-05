# ./services/chat_service.py
from ollama import AsyncClient
import logging
from typing import Dict, Any, Optional, List
from ..services.knowledge_base_service import KnowledgeBaseIndexer
from ..models.user_model import User
from sqlalchemy.orm import Session
from ..db import get_db
from ..models.file_model import FileRecord

logger = logging.getLogger(__name__)

class ChatbotService:
    def __init__(self, knowledge_base: KnowledgeBaseIndexer = None, default_model: str = "qwen2:0.5b"):
        self.knowledge_base = knowledge_base
        self.default_model = default_model
        self.llm = AsyncClient(host="http://localhost:11434")
    
    async def generate_response(
        self, 
        query: str, 
        user_id: Optional[str] = None,
        model: Optional[str] = None,
        db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """
        Generate a response to the user's query, optionally using RAG with user-specific documents.
        
        Args:
            query: The user's question or prompt
            user_id: The ID of the user (for user-specific RAG)
            model: The model to use for generation (defaults to self.default_model)
            db: Database session (for user-specific operations)
            
        Returns:
            Dictionary with response content and RAG context
        """
        try:
            # Use provided model or fall back to default
            model_to_use = model or self.default_model
            
            # Get user-specific context if user_id is provided
            context_results = []
            if self.knowledge_base and user_id:
                # Search for documents relevant to this user's query
                context_results = self.knowledge_base.search(query, user_id=user_id)
            
            # Format context if available
            if context_results:
                context_str = "\n\n".join([
                    f"[Relevance: {res['relevance_score']:.2f}] {res['text']}"
                    for res in context_results
                ])
                
                prompt = f"""
                Use the following context to answer the question.
                If the context is insufficient, use your own knowledge.
                
                Context:
                {context_str}
                
                Question:
                {query}
                
                Provide a comprehensive and helpful response based on the available information.
                """
            else:
                prompt = query
            
            # Generate response using the selected model
            response = await self.llm.chat(
                model=model_to_use,
                messages=[{"role": "user", "content": prompt}],
                stream=False
            )
            
            return {
                "content": response["message"]["content"],
                "ragContext": context_results,
                "model": model_to_use
            }
        except Exception as e:
            logger.error(f"LLM generation error: {e}")
            return {
                "content": "Sorry, I couldn't generate a response. Please try again later.", 
                "ragContext": [],
                "model": model or self.default_model
            }
    
    async def get_available_models(self) -> List[str]:
        """
        Get a list of available models from Ollama.
        
        Returns:
            List of model names
        """
        try:
            models = await self.llm.list()
            return [model["name"] for model in models["models"]]
        except Exception as e:
            logger.error(f"Error fetching models: {e}")
            return [self.default_model]  # Return default model if there's an error
    
    async def summarize_text(
        self, 
        text: str, 
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate a summary of the provided text.
        
        Args:
            text: The text to summarize
            model: The model to use for generation
            
        Returns:
            Dictionary with summary content
        """
        prompt = f"""
        Summarize the following text in a concise manner while preserving the key information:
        
        {text}
        """
        
        try:
            model_to_use = model or self.default_model
            response = await self.llm.chat(
                model=model_to_use,
                messages=[{"role": "user", "content": prompt}],
                stream=False
            )
            
            return {
                "content": response["message"]["content"],
                "model": model_to_use
            }
        except Exception as e:
            logger.error(f"Summarization error: {e}")
            return {
                "content": "Sorry, I couldn't generate a summary. Please try again later.",
                "model": model or self.default_model
            }
    
    async def humanize_text(
        self, 
        text: str, 
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Rewrite the provided text in a more conversational and human-like tone.
        
        Args:
            text: The text to humanize
            model: The model to use for generation
            
        Returns:
            Dictionary with humanized content
        """
        prompt = f"""
        Rewrite the following text in a more conversational and human-like tone, 
        making it more engaging and easier to understand:
        
        {text}
        """
        
        try:
            model_to_use = model or self.default_model
            response = await self.llm.chat(
                model=model_to_use,
                messages=[{"role": "user", "content": prompt}],
                stream=False
            )
            
            return {
                "content": response["message"]["content"],
                "model": model_to_use
            }
        except Exception as e:
            logger.error(f"Humanization error: {e}")
            return {
                "content": "Sorry, I couldn't rewrite the text. Please try again later.",
                "model": model or self.default_model
            }