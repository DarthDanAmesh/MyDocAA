'use client';

import { useState } from 'react';
import DocumentCard from './DocumentCard';

interface Document {
  file_id: string;
  filename: string;
  size: number;
  content_type: string;
  tags: string[];
  status: 'uploaded' | 'processing' | 'processed' | 'error';
}

export default function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Document[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]); // Fetch from backend

  const handleSearch = async () => {
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, tags: selectedTags }),
      });
      const data = await response.json();
      setResults(data.documents);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Fetch available tags (implement in backend)
  // useEffect(() => {
  //   fetch('/api/tags', { headers: { Authorization: `Bearer ${token}` } })
  //     .then(res => res.json())
  //     .then(data => setAvailableTags(data.tags));
  // }, []);

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Search Documents</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documents..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Search
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {availableTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`tag ${selectedTags.includes(tag) ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-800'}`}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.map((doc) => (
            <DocumentCard
              key={doc.file_id}
              document={doc}
              onDelete={() => setResults((prev) => prev.filter((d) => d.file_id !== doc.file_id))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}