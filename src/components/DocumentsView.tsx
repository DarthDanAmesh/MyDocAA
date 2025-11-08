// src/components/DocumentsView.tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DocumentCard from './DocumentCard';

interface Document {
  file_id: string;
  filename: string;
  size: number;
  content_type: string;
  tags: string[];
  status: 'uploading' | 'uploaded' | 'processing' | 'processed' | 'error';
  created_at?: string;
  file_path?: string;
}

export default function DocumentsView() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token, user } = useAuth();

  // Screen reader announcements
  useEffect(() => {
    if (statusAnnouncement) {
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.className = 'sr-only';
      announcement.textContent = statusAnnouncement;
      document.body.appendChild(announcement);
      
      setTimeout(() => {
        document.body.removeChild(announcement);
      }, 1000);
    }
  }, [statusAnnouncement]);

  // Fetch existing documents on component mount
  useEffect(() => {
    if (token) {
      fetchDocuments();
    }
  }, [token]);

  const fetchDocuments = async () => {
    if (!token) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/files/', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        const formattedDocs = data.map((doc: any) => ({
          ...doc,
          status: doc.status || 'processed',
          tags: doc.tags || []
        }));
        setDocuments(formattedDocs);
      } else {
        throw new Error(`Failed to fetch documents: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setError('Failed to load documents. Please try again.');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  // Reusable function to update document status
  const updateDocumentStatus = (fileId: string, status: Document['status'], additionalData: Partial<Document> = {}) => {
    setDocuments(prev => 
      prev.map(doc => 
        doc.file_id === fileId 
          ? { ...doc, status, ...additionalData } 
          : doc
      )
    );
    setStatusAnnouncement(`Document ${status}`);
  };

  // Reusable function to fetch document tags
  const fetchDocumentTags = async (fileId: string) => {
    if (!token) return;
    
    try {
      const tagsResponse = await fetch(`/api/files/${fileId}/tags`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      
      if (tagsResponse.ok) {
        const tagsData = await tagsResponse.json();
        setDocuments(prev => 
          prev.map(doc => 
            doc.file_id === fileId 
              ? { ...doc, tags: tagsData.tags || [] } 
              : doc
          )
        );
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  };

  const handleView = async (file_id: string) => {
    try {
      const response = await fetch(`/api/files/${file_id}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      
      if (response.ok) {
        const fileData = await response.json();
        setPreviewDocument(fileData);
      } else {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      setError('Failed to load file for preview.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadSingleFile = async (file: File): Promise<void> => {
    if (!token) {
      throw new Error('User not authenticated');
    }

    // Check file type
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File type ${file.type} is not supported`);
    }

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File size exceeds 5MB limit');
    }

    // Create FormData
    const formData = new FormData();
    formData.append('file', file);
    
    // Add document to UI with uploading status
    const tempDoc: Document = {
      file_id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filename: file.name,
      size: file.size,
      content_type: file.type,
      tags: [],
      status: 'uploading'
    };
    
    setDocuments(prev => [...prev, tempDoc]);
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(prev => ({
            ...prev,
            [tempDoc.file_id]: percentComplete
          }));
        }
      });
      
      xhr.open('POST', '/api/files/');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      
      xhr.onload = function() {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          
          // Update document with real data
          updateDocumentStatus(tempDoc.file_id, 'processing', data);
          
          // Fetch tags after a short delay to allow processing
          setTimeout(async () => {
            await fetchDocumentTags(data.file_id);
            updateDocumentStatus(tempDoc.file_id, 'processed');
          }, 2000);
          
          resolve();
        } else {
          reject(new Error(`HTTP error! status: ${xhr.status}`));
        }
      };
      
      xhr.onerror = function() {
        reject(new Error('Network error during upload'));
      };
      
      xhr.send(formData);
    });
  };

  const uploadFiles = async (files: File[]) => {
    if (!token) {
      setError('User not authenticated');
      setTimeout(() => setError(null), 5000);
      return;
    }

    const MAX_CONCURRENT_UPLOADS = 3;
    const uploadQueue = [...files];
    const activeUploads: Promise<void>[] = [];
    
    const processUpload = async (file: File) => {
      try {
        await uploadSingleFile(file);
      } catch (error) {
        console.error('Upload error:', error);
        setError(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setTimeout(() => setError(null), 5000);
        
        // Mark document as errored
        setDocuments(prev => 
          prev.map(doc => 
            doc.filename === file.name && doc.status === 'uploading'
              ? { ...doc, status: 'error' } 
              : doc
          )
        );
      }
    };
    
    // Process queue with concurrency limit
    while (uploadQueue.length > 0 || activeUploads.length > 0) {
      // Start new uploads if under the limit
      while (activeUploads.length < MAX_CONCURRENT_UPLOADS && uploadQueue.length > 0) {
        const file = uploadQueue.shift();
        if (file) {
          const uploadPromise = processUpload(file);
          activeUploads.push(uploadPromise);
          
          uploadPromise.finally(() => {
            // Remove from active uploads when complete
            const index = activeUploads.indexOf(uploadPromise);
            if (index > -1) {
              activeUploads.splice(index, 1);
            }
          });
        }
      }
      
      // Wait for at least one upload to complete if queue is full
      if (activeUploads.length >= MAX_CONCURRENT_UPLOADS) {
        await Promise.race(activeUploads);
      } else if (activeUploads.length > 0) {
        // Wait for remaining uploads if queue is empty
        await Promise.all(activeUploads);
      }
    }
  };

  const handleDelete = async (file_id: string) => {
    if (!token) return;
    
    try {
      const response = await fetch(`/api/files/${file_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      
      if (response.ok) {
        setDocuments((prev) => prev.filter((doc) => doc.file_id !== file_id));
        setStatusAnnouncement('Document deleted successfully');
      } else {
        throw new Error(`Failed to delete file: ${response.status}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      setError('Failed to delete document.');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleReindex = async (file_id: string) => {
    if (!token) return;
    
    try {
      // Update document status to processing
      updateDocumentStatus(file_id, 'processing');
      
      const response = await fetch(`/api/files/${file_id}/reindex`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });
      
      if (response.ok) {
        // Fetch updated tags
        await fetchDocumentTags(file_id);
        updateDocumentStatus(file_id, 'processed');
        setStatusAnnouncement('Document reindexed successfully');
      } else {
        throw new Error(`Failed to reindex file: ${response.status}`);
      }
    } catch (error) {
      console.error('Reindex error:', error);
      updateDocumentStatus(file_id, 'error');
      setError('Failed to reindex document.');
      setTimeout(() => setError(null), 5000);
    }
  };

  // Filter documents based on search and status
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || doc.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed': return 'bg-green-100 text-green-800';
      case 'processing': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-semibold">Documents</h2>
            <div className="text-sm text-gray-600 mt-1">
              {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? 's' : ''} shown
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex justify-between items-center">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
              aria-label="Dismiss error"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Search and Filter */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search documents by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Search documents"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            <option value="processed">Processed</option>
            <option value="processing">Processing</option>
            <option value="uploading">Uploading</option>
            <option value="error">Error</option>
          </select>
        </div>
        
        {/* Drag and Drop Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="File upload area. Drag and drop files here or press Enter or Space to browse."
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-gray-600 mb-2">
            Drag and drop files here (PDF, PNG, JPEG, Excel)
          </p>
          <p className="text-xs text-gray-500 mb-4">Maximum file size: 5MB</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Browse Files
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".pdf,.png,.jpeg,.jpg,.xlsx,.xls"
            multiple
            className="hidden"
            aria-label="Select files to upload"
          />
        </div>
        
        {/* Loading State */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No documents found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || filterStatus !== 'all' 
                ? 'Try adjusting your search or filter criteria' 
                : 'Upload documents to get started'
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocuments.map((doc) => (
              <DocumentCard
                key={doc.file_id}
                document={doc}
                uploadProgress={uploadProgress[doc.file_id]}
                onDelete={() => handleDelete(doc.file_id)}
                onReindex={() => handleReindex(doc.file_id)}
                onView={() => handleView(doc.file_id)}
              />
            ))}
          </div>
        )}

        {/* Document Preview Modal */}
        {previewDocument && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-xl font-semibold">{previewDocument.filename}</h2>
                <button
                  onClick={() => setPreviewDocument(null)}
                  className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Close preview"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="flex-1 overflow-auto p-6">
                {previewDocument.content_type?.includes('image') ? (
                  <div className="flex justify-center">
                    <img 
                      src={previewDocument.file_path} 
                      alt={previewDocument.filename}
                      className="max-w-full h-auto max-h-[60vh] object-contain"
                    />
                  </div>
                ) : previewDocument.content_type === 'application/pdf' ? (
                  <iframe 
                    src={previewDocument.file_path} 
                    className="w-full h-[60vh] border-0"
                    title={previewDocument.filename}
                  />
                ) : (
                  <div className="text-center p-8 bg-gray-100 rounded-lg">
                    <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-600 mb-4">Preview not available for this file type.</p>
                    <a 
                      href={previewDocument.file_path} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download File
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}