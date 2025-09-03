'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

interface FileItem {
  file_path: string;
  filename: string;
  size: number;
  content_type: string;
  user_id: string;
}

export default function FileList() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:8000/api/files/', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        params: {
          user_id: 'test-user'
        }
      });
      setFiles(response.data);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  const processFile = async (fileId: string, fileType: string) => {
    setProcessing(fileId);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `http://localhost:8000/api/files/${fileId}/process`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          params: {
            file_type: fileType,
            user_id: 'test-user'
          }
        }
      );
      console.log('Processing result:', response.data);
      alert('File processed successfully!');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Processing failed');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="p-6">Loading files...</div>;
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Uploaded Files</h2>
      {files.length === 0 ? (
        <p className="text-gray-500">No files uploaded yet.</p>
      ) : (
        <div className="space-y-4">
          {files.map((file) => (
            <div key={file.file_path} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h3 className="font-medium">{file.filename}</h3>
                <p className="text-sm text-gray-500">
                  {file.content_type} • {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={() => processFile(file.file_path, file.content_type)}
                disabled={processing === file.file_path}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
              >
                {processing === file.file_path ? 'Processing...' : 'Process'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}