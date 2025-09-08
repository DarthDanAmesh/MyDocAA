// src/components/ChatInterface.tsx
'use client';

import { useState, useRef, useEffect, useContext } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'image';
  model?: string;
  ragContext?: { text: string; metadata: any; relevance_score: number }[];
}

const AVAILABLE_MODELS = [
  { id: 'qwen2:0.5b', name: 'Qwen2:0.5b', description: 'Efficient and fast' },
  // Add more models if supported by backend
];

export default function ChatInterface() {
  const {token, user} = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedModel, setSelectedModel] = useState('qwen2:0.5b');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {

    if (!token){
      //redirect to login or show login modal
      console.log('User not authenticated');
      return;
    }
    
    const ws = new WebSocket(`ws://localhost:8000/api/chat/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [...prev, data]);
      setIsLoading(false);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setIsConnected(false);
      setIsLoading(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
      setIsLoading(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [token]);


  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !isConnected) return;

    const userMessage: Message = { role: 'user', content: input, model: selectedModel };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(userMessage));
    } else {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'WebSocket is not connected.' }]);
      setIsLoading(false);
    }
  };

  const handleAction = async (action: 'summarize' | 'humanize' | 'export', messageIndex: number) => {
    const message = messages[messageIndex];
    try {
      const response = await fetch(`/api/chat/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content: message.content, model: selectedModel }),
      });
      const data = await response.json();
      if (action === 'export') {
        const blob = new Blob([data.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setMessages((prev) =>
          prev.map((m, i) => (i === messageIndex ? { ...m, content: data.content } : m))
        );
      }
    } catch (error) {
      console.error(`Error in ${action}:`, error);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error during ${action}.` }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const clearConversation = async () => {
    try {
      await fetch('/api/chat/clear', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setMessages([]);
    } catch (error) {
      console.error('Error clearing conversation:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Add a login status indicator */}
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">DocAA Chat</h1>
            {user && (
              <span className="text-sm text-gray-600">Welcome, {user.username}</span>
            )}
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
              >
                <span>{AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.name}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showModelDropdown && (
                <div className="absolute top-full left-0 mt-1 w-80 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                  {AVAILABLE_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setSelectedModel(model.id);
                        setShowModelDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between ${
                        selectedModel === model.id ? 'bg-gray-50' : ''
                      }`}
                    >
                      <div>
                        <div className="font-medium text-sm">{model.name}</div>
                        <div className="text-xs text-gray-500">{model.description}</div>
                      </div>
                      {selectedModel === model.id && (
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button onClick={clearConversation} className="p-2 text-gray-600 hover:text-gray-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center py-24">
              <h2 className="text-3xl font-semibold text-gray-900 mb-2">
                How can I assist you today?
              </h2>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index} className="px-4 py-6">
              <div className="flex gap-4">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.role === 'user' ? 'bg-white border border-gray-300' : 'bg-black text-white'
                  }`}
                >
                  {message.role === 'user' ? (
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <div className="font-semibold text-sm">
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    {message.role === 'assistant' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction('summarize', index)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Summarize
                        </button>
                        <button
                          onClick={() => handleAction('humanize', index)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Humanize
                        </button>
                        <button
                          onClick={() => handleAction('export', index)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Export
                        </button>
                      </div>
                    )}
                  </div>
                  {message.ragContext && (
                    <div className="text-xs text-gray-500 mb-2">
                      Retrieved {message.ragContext.length} document(s)
                    </div>
                  )}
                  <div className="prose prose-sm max-w-none text-gray-800">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="px-4 py-6">
              <div className="max-w-3xl mx-auto flex gap-4">
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    <div
                      className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"
                      style={{ animationDelay: '0.2s' }}
                    />
                    <div
                      className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"
                      style={{ animationDelay: '0.4s' }}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm mb-1">Assistant</div>
                  <div className="text-gray-600 text-sm">Processing...</div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="border-t bg-white">
        <div className="max-w-3xl mx-auto p-4">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the assistant..."
              className="w-full px-4 py-3 pr-12 bg-gray-100 border border-gray-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-black"
              rows={1}
              style={{ maxHeight: '200px' }}
              disabled={isLoading || !isConnected}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !isConnected}
              className={`absolute right-3 bottom-3 p-1.5 rounded-lg ${
                isLoading || !input.trim() || !isConnected
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-white bg-black hover:bg-gray-800'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2 text-center">
            {isConnected
              ? 'Assistant may use retrieved documents for responses.'
              : 'Connecting to chat service...'}
          </p>
        </div>
      </div>
    </div>
  );
}