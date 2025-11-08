// src/components/ChatInterface.tsx
'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'image';
  model?: string;
  ragContext?: { text: string; metadata: any; relevance_score: number }[];
  actionType?: 'summarize' | 'humanize' | null;
  originalContent?: string;
  isExpanded?: boolean;
}

const AVAILABLE_MODELS = [
  { id: 'qwen2:0.5b', name: 'Qwen2:0.5b', description: 'Efficient and fast' },
  // Add more models if supported by backend
];

// WebSocket connection states
type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export default function ChatInterface() {
  const { token, user, logout } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [selectedModel, setSelectedModel] = useState('qwen2:0.5b');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportContent, setExportContent] = useState('');
  const [exportFormat, setExportFormat] = useState('txt');
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 1000;

  // Authentication check
  useEffect(() => {
    if (!token) {
      console.log('User not authenticated, redirecting to login');
      router.push('/login');
      return;
    }
  }, [token, router]);

  // WebSocket connection 

  const connectWebSocket = useCallback(() => {
  if (!token) {
    console.log('No token available, skipping WebSocket connection');
    return;
  }

  // Clear any existing connection
  if (wsRef.current) {
    wsRef.current.close();
  }

  setConnectionState('connecting');
  setError(null);

  try {
    // Use wss:// for production, ws:// for development
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws?token=${token}`;
    
    console.log('Attempting WebSocket connection to:', wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected successfully');
      setConnectionState('connected');
      setReconnectAttempts(0);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const newMessage: Message = {
          ...data,
          timestamp: new Date()
        };
        setMessages((prev) => [...prev, newMessage]);
        setIsLoading(false);
      } catch (parseError) {
        console.error('Error parsing WebSocket message:', parseError);
        setError('Failed to parse server response');
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      setConnectionState('disconnected');
      setIsLoading(false);

      // Don't attempt reconnect if it was a normal closure or unauthorized
      if (event.code === 1000 || event.code === 1008) { // 1008 = policy violation
        console.log('WebSocket closed normally, not reconnecting');
        return;
      }

      // Attempt reconnect with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000);
        console.log(`Attempting reconnect in ${delay}ms (attempt ${reconnectAttempts + 1})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connectWebSocket();
        }, delay);
      } else {
        setError('Failed to connect after multiple attempts. Please refresh the page.');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket connection error:', error);
      setConnectionState('error');
      setError('Failed to connect to chat service');
      setIsLoading(false);
    };

  } catch (error) {
    console.error('Failed to create WebSocket connection:', error);
    setConnectionState('error');
    setError('Failed to establish connection');
  }
}, [token, reconnectAttempts]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (token) {
      connectWebSocket();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token, connectWebSocket]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to clear conversation
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        clearConversation();
      }
      // Ctrl/Cmd + E to export last message
      if ((e.ctrlKey || e.metaKey) && e.key === 'e' && messages.length > 0) {
        e.preventDefault();
        handleAction('export', messages.length - 1);
      }
      // Escape to cancel editing
      if (e.key === 'Escape' && editingIndex !== null) {
        setEditingIndex(null);
        setEditContent('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [messages, editingIndex]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || connectionState !== 'connected') return;

    const userMessage: Message = { 
      role: 'user', 
      content: input, 
      model: selectedModel,
      timestamp: new Date()
    };
    
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(userMessage));
      } catch (error) {
        console.error('Error sending message:', error);
        setError('Failed to send message');
        setIsLoading(false);
        setMessages((prev) => [...prev, { 
          role: 'assistant', 
          content: 'Failed to send message. Please try again.',
          timestamp: new Date()
        }]);
      }
    } else {
      setError('WebSocket is not connected');
      setIsLoading(false);
      setMessages((prev) => [...prev, { 
        role: 'assistant', 
        content: 'Connection lost. Please try again.',
        timestamp: new Date()
      }]);
      
      // Attempt to reconnect
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        connectWebSocket();
      }
    }
  };

  const handleAction = async (action: 'summarize' | 'humanize' | 'export', messageIndex: number) => {
    const message = messages[messageIndex];
    setError(null);

    try {
      if (action === 'export') {
        setShowExportModal(true);
        setExportContent(message.content);
        return;
      }

      const response = await fetch(`/api/chat/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content: message.content, model: selectedModel }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      setMessages((prev) =>
        prev.map((m, i) => 
          i === messageIndex 
            ? { 
                ...m, 
                content: data.content, 
                actionType: action,
                originalContent: m.content,
                isExpanded: true
              } 
            : m
        )
      );
    } catch (error) {
      console.error(`Error in ${action}:`, error);
      setError(`Failed to ${action} message`);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch(`/api/chat/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          content: exportContent, 
          model: selectedModel,
          format: exportFormat 
        }),
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const extension = exportFormat === 'markdown' ? 'md' : exportFormat;
        a.download = `chat-${Date.now()}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShowExportModal(false);
      } else {
        throw new Error(`Export failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error exporting:', error);
      setError('Failed to export message');
    }
  };

  const toggleAccordion = (messageIndex: number) => {
    setMessages((prev) =>
      prev.map((m, i) => 
        i === messageIndex 
          ? { ...m, isExpanded: !m.isExpanded } 
          : m
      )
    );
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
      setError(null);
    } catch (error) {
      console.error('Error clearing conversation:', error);
      setError('Failed to clear conversation');
    }
  };

  const startEditing = (messageIndex: number) => {
    const message = messages[messageIndex];
    if (message.role === 'user') {
      setEditingIndex(messageIndex);
      setEditContent(message.content);
    }
  };

  const saveEdit = () => {
    if (editingIndex !== null) {
      setMessages(prev =>
        prev.map((m, i) =>
          i === editingIndex ? { ...m, content: editContent } : m
        )
      );
      setEditingIndex(null);
      setEditContent('');
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditContent('');
  };

  const connectionStatusText = useMemo(() => {
    switch (connectionState) {
      case 'connecting': return 'Connecting...';
      case 'connected': return 'Connected';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Connection Error';
      default: return 'Unknown';
    }
  }, [connectionState]);

  const canSendMessage = input.trim() && !isLoading && connectionState === 'connected';

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
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
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
                aria-expanded={showModelDropdown}
                aria-haspopup="true"
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
          <div className="flex items-center gap-2">
            {/* Connection Status Indicator */}
            <div className={`flex items-center gap-1 text-sm ${
              connectionState === 'connected' ? 'text-green-600' : 
              connectionState === 'connecting' ? 'text-yellow-600' : 
              'text-red-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
              connectionState === 'connected' ? 'bg-green-500' : 
              connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
              'bg-red-500'
            }`} />
              {connectionState === 'connected' ? 'Connected' :
              connectionState === 'connecting' ? 'Connecting...' :
              'Disconnected'}
              {reconnectAttempts > 0 && ` (Retry ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`}
            </div>
            
            <button 
              onClick={clearConversation} 
              className="p-2 text-gray-600 hover:text-gray-800"
              title="Clear conversation (Ctrl+K)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <span className="text-sm text-red-800">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center py-24">
              <h2 className="text-3xl font-semibold text-gray-900 mb-2">
                How can I assist you today?
              </h2>
              <p className="text-gray-600">
                Start a conversation or ask a question to begin.
              </p>
            </div>
          )}
          
          {messages.map((message, index) => (
            <div key={index} className="px-4 py-6 border-b border-gray-100">
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
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {message.role === 'user' ? 'You' : 'Assistant'}
                      {message.actionType && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                          {message.actionType === 'summarize' ? 'Summarized' : 'Humanized'}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{message.timestamp.toLocaleTimeString()}</span>
                      {message.role === 'user' && (
                        <button
                          onClick={() => startEditing(index)}
                          className="hover:text-gray-700"
                          title="Edit message"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {message.ragContext && (
                    <div className="text-xs text-gray-500 mb-2">
                      Retrieved {message.ragContext.length} document(s)
                    </div>
                  )}
                  
                  {/* Message Editing */}
                  {editingIndex === index ? (
                    <div className="space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg resize-none"
                        rows={4}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          className="px-3 py-1 text-sm bg-black text-white rounded-md hover:bg-gray-800"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Accordion for messages with actions */}
                      {message.actionType && message.originalContent && (
                        <div className="mb-2 border border-gray-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => toggleAccordion(index)}
                            className="w-full flex justify-between items-center p-2 bg-gray-50 hover:bg-gray-100 text-left"
                          >
                            <span className="text-sm font-medium">
                              {message.isExpanded ? 'Hide Original' : 'View Original'}
                            </span>
                            <svg
                              className={`w-4 h-4 transform transition-transform ${
                                message.isExpanded ? 'rotate-180' : ''
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          
                          {message.isExpanded && (
                            <div className="p-3 bg-white border-t border-gray-200">
                              <div className="text-sm text-gray-600 mb-1">Original:</div>
                              <div className="prose prose-sm max-w-none text-gray-800">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.originalContent}</ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Main content */}
                      <div className="prose prose-sm max-w-none text-gray-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
                    </>
                  )}
                  
                  {/* Action buttons */}
                  {message.role === 'assistant' && editingIndex !== index && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleAction('summarize', index)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded"
                      >
                        Summarize
                      </button>
                      <button
                        onClick={() => handleAction('humanize', index)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded"
                      >
                        Humanize
                      </button>
                      <button
                        onClick={() => handleAction('export', index)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-100 rounded"
                        title="Export (Ctrl+E)"
                      >
                        Export
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {/* Loading indicator */}
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

      {/* Input Area */}
      <div className="border-t bg-white">
        <div className="max-w-3xl mx-auto p-4">
          <form onSubmit={handleSubmit} className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the assistant..."
              aria-label="Message input"
              role="textbox"
              aria-multiline="true"
              className="w-full px-4 py-3 pr-12 bg-gray-100 border border-gray-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50"
              rows={1}
              style={{ maxHeight: '200px' }}
              disabled={isLoading || connectionState !== 'connected'}
            />
            <button
              type="submit"
              disabled={!canSendMessage}
              className={`absolute right-3 bottom-3 p-1.5 rounded-lg transition-colors ${
                canSendMessage
                  ? 'text-white bg-black hover:bg-gray-800'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
              aria-label="Send message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2 text-center">
            {connectionState === 'connected'
              ? 'Assistant may use retrieved documents for responses.'
              : `Connection status: ${connectionStatusText}`}
          </p>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Export Chat</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Export Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['txt', 'markdown', 'pdf'].map((format) => (
                  <button
                    key={format}
                    onClick={() => setExportFormat(format)}
                    className={`py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                      exportFormat === format
                        ? 'bg-black text-white'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}