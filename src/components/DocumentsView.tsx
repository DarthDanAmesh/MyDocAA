'use client';

import { useState, useRef } from 'react';
import DocumentCard from './DocumentCard';

interface Document {
  file_id: string;
  filename: string;
  size: number;
  content_type: string;
  tags: string[];
  status: 'uploaded' | 'processing' | 'processed' | 'error';
}

export default function DocumentsView() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadFiles(files);
  };

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', 'user_123'); // Replace with actual user ID
      try {
        const response = await fetch('/api/files/', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await response.json();
        setDocuments((prev) => [
          ...prev,
          { ...data, status: 'uploaded', tags: [] },
        ]);
        // Trigger processing
        await fetch(`/api/files/${data.file_id}/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ file_type: data.content_type }),
        });
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.file_id === data.file_id ? { ...doc, status: 'processed' } : doc
          )
        );
        // Fetch tags (implement in backend)
        // const tagsResponse = await fetch(`/api/files/${data.file_id}/tags`);
        // const tags = await tagsResponse.json();
        // setDocuments(prev => prev.map(doc => doc.file_id === data.file_id ? { ...doc, tags } : doc));
      } catch (error) {
        console.error('Upload error:', error);
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.file_id === data.file_id ? { ...doc, status: 'error' } : doc
          )
        );
      }
    }
  };

  const handleDelete = async (file_id: string) => {
    try {
      await fetch(`/api/files/${file_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDocuments((prev) => prev.filter((doc) => doc.file_id !== file_id));
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Documents</h2>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <p className="text-gray-600 mb-2">
            Drag and drop files here (PDF, PNG, JPEG, Excel)
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.file_id}
              document={doc}
              onDelete={() => handleDelete(doc.file_id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}