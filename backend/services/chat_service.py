# backend/services/chat_service.py

from ollama import AsyncClient
import logging
from backend.services.knowledge_base_service import KnowledgeBaseIndexer

logger = logging.getLogger(__name__)

class ChatbotService:
    def __init__(self, knowledge_base: KnowledgeBaseIndexer = None, model: str = "qwen2"):
        self.knowledge_base = knowledge_base
        self.model = model
        self.llm = AsyncClient(host="http://localhost:11434")

    async def generate_response(self, query: str) -> dict:
        try:
            context_results = (
                self.knowledge_base.search(query) if self.knowledge_base else []
            )
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
                """
            else:
                prompt = query

            response = await self.llm.chat(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                stream=False
            )
            return {
                "content": response["message"]["content"],
                "ragContext": context_results
            }
        except Exception as e:
            logger.error(f"LLM generation error: {e}")
            return {"content": "Sorry, I couldn't generate a response.", "ragContext": []}