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
  status: 'uploading' |'uploaded' | 'processing' | 'processed' | 'error';
  created_at?: string;
}

export default function DocumentsView() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token, user } = useAuth();

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
        // Add default status and tags to documents if not present
        const formattedDocs = data.map((doc: any) => ({
          ...doc,
          status: 'processed',
          tags: []
        }));
        setDocuments(formattedDocs);
      } else {
        console.error('Failed to fetch documents');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setIsLoading(false);
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
        // Handle viewing the file (open in new tab, show preview, etc.)
        window.open(fileData.file_path, '_blank');
      } else {
        console.error('Failed to fetch file');
      }
    } catch (error) {
      console.error('Error viewing file:', error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
  };

  const uploadFiles = async (files: File[]) => {
    if (!token) {
      console.error('User not authenticated');
      return;
    }

    for (const file of files) {
      // Check file type
      const allowedTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        alert(`File type ${file.type} is not supported`);
        continue;
      }

      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB limit');
        continue;
      }

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      
      // Add document to UI with uploading status
      const tempDoc: Document = {
        file_id: `temp-${Date.now()}`,
        filename: file.name,
        size: file.size,
        content_type: file.type,
        tags: [],
        status: 'uploading'
      };
      
      setDocuments(prev => [...prev, tempDoc]);
      
      try {
        const response = await fetch('/api/files/', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Update document with real data
        setDocuments(prev => 
          prev.map(doc => 
            doc.file_id === tempDoc.file_id 
              ? { ...data, status: 'processing', tags: [] } 
              : doc
          )
        );
        
        // Fetch tags after a short delay to allow processing
        setTimeout(async () => {
          try {
            const tagsResponse = await fetch(`/api/files/${data.file_id}/tags`, {
              headers: { Authorization: `Bearer ${token}` },
              credentials: 'include',
            });
            
            if (tagsResponse.ok) {
              const tagsData = await tagsResponse.json();
              setDocuments(prev => 
                prev.map(doc => 
                  doc.file_id === data.file_id 
                    ? { ...doc, status: 'processed', tags: tagsData.tags || [] } 
                    : doc
                )
              );
            } else {
              // If tags endpoint fails, still mark as processed
              setDocuments(prev => 
                prev.map(doc => 
                  doc.file_id === data.file_id 
                    ? { ...doc, status: 'processed' } 
                    : doc
                )
              );
            }
          } catch (error) {
            console.error('Error fetching tags:', error);
            // Still mark as processed even if tags fail
            setDocuments(prev => 
              prev.map(doc => 
                doc.file_id === data.file_id 
                  ? { ...doc, status: 'processed' } 
                  : doc
              )
            );
          }
        }, 2000); // 2 second delay to allow processing
        
      } catch (error) {
        console.error('Upload error:', error);
        
        // Mark document as errored
        setDocuments(prev => 
          prev.map(doc => 
            doc.file_id === tempDoc.file_id 
              ? { ...doc, status: 'error' } 
              : doc
          )
        );
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
      } else {
        console.error('Failed to delete file');
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleReindex = async (file_id: string) => {
    if (!token) return;
    
    try {
      // Update document status to processing
      setDocuments(prev => 
        prev.map(doc => 
          doc.file_id === file_id 
            ? { ...doc, status: 'processing' } 
            : doc
        )
      );
      
      const response = await fetch(`/api/files/${file_id}/reindex`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          credentials: 'include', 
        }
      });
      
      if (response.ok) {
        // Update document status back to processed
        setDocuments(prev => 
          prev.map(doc => 
            doc.file_id === file_id 
              ? { ...doc, status: 'processed' } 
              : doc
          )
        );
        
        // Fetch updated tags
        try {
          const tagsResponse = await fetch(`/api/files/${file_id}/tags`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include',
          });
          
          if (tagsResponse.ok) {
            const tagsData = await tagsResponse.json();
            setDocuments(prev => 
              prev.map(doc => 
                doc.file_id === file_id 
                  ? { ...doc, tags: tagsData.tags || [] } 
                  : doc
              )
            );
          }
        } catch (error) {
          console.error('Error fetching tags after reindex:', error);
        }
      } else {
        console.error('Failed to reindex file');
        setDocuments(prev => 
          prev.map(doc => 
            doc.file_id === file_id 
              ? { ...doc, status: 'error' } 
              : doc
          )
        );
      }
    } catch (error) {
      console.error('Reindex error:', error);
      setDocuments(prev => 
        prev.map(doc => 
          doc.file_id === file_id 
            ? { ...doc, status: 'error' } 
            : doc
        )
      );
    }
  };

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
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">Documents</h2>
          <div className="text-sm text-gray-600">
            {documents.length} document{documents.length !== 1 ? 's' : ''} uploaded
          </div>
        </div>
        
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
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
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
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
          />
        </div>
        
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No documents</h3>
            <p className="mt-1 text-sm text-gray-500">Upload documents to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.file_id}
                document={doc}
                onDelete={() => handleDelete(doc.file_id)}
                onReindex={() => handleReindex(doc.file_id)}
                onView={() => handleReindex(doc.file_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}