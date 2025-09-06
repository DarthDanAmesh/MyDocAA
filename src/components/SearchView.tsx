// src/components/SearchView.tsx
'use client';
import { useState, useEffect } from 'react';
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
}

interface SearchResult {
  documents: Document[];
  total_results: number;
  query: string;
}

export default function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Document[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const { token } = useAuth();

  // Fetch available tags and search history on component mount
  useEffect(() => {
    if (token) {
      fetchAvailableTags();
      fetchSearchHistory();
    }
  }, [token]);

  const fetchAvailableTags = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/files/tags', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailableTags(data.tags || []);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const fetchSearchHistory = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/chat/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSearchHistory(data.queries || []);
      }
    } catch (error) {
      console.error('Error fetching search history:', error);
    }
  };

  const handleSearch = async (searchQuery?: string) => {
    const searchValue = searchQuery || query;
    if (!searchValue.trim() || !token) return;
    
    setIsSearching(true);
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          query: searchValue, 
          tags: selectedTags 
        }),
      });
      
      if (response.ok) {
        const data: SearchResult = await response.json();
        setResults(data.documents || []);
        
        // Add to search history if not already there
        if (!searchHistory.includes(searchValue)) {
          setSearchHistory(prev => [searchValue, ...prev.slice(0, 9)]); // Keep last 10 searches
        }
      } else {
        console.error('Search failed');
        setResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSelectedTags([]);
    setQuery('');
    setResults([]);
  };

  const handleQuickSearch = (historyQuery: string) => {
    setQuery(historyQuery);
    handleSearch(historyQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Search Documents</h2>
        
        {/* Search Input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documents..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => handleSearch()}
            disabled={isSearching || !query.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSearching ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Searching
              </div>
            ) : 'Search'}
          </button>
          {(query || selectedTags.length > 0) && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Clear
            </button>
          )}
        </div>
        
        {/* Search History */}
        {searchHistory.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Searches</h3>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((historyQuery, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickSearch(historyQuery)}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200"
                >
                  {historyQuery}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Tag Filters */}
        {availableTags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Filter by Tags</h3>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    selectedTags.includes(tag) 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            {selectedTags.length > 0 && (
              <div className="mt-2 text-sm text-gray-600">
                Active filters: {selectedTags.join(', ')}
              </div>
            )}
          </div>
        )}
        
        {/* Results */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">
              Search Results {results.length > 0 && `(${results.length})`}
            </h3>
          </div>
          
          {isSearching ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((doc) => (
                <DocumentCard
                  key={doc.file_id}
                  document={doc}
                  onDelete={() => setResults((prev) => prev.filter((d) => d.file_id !== doc.file_id))}
                />
              ))}
            </div>
          ) : query ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No results found</h3>
              <p className="mt-1 text-sm text-gray-500">Try different keywords or filters</p>
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Search your documents</h3>
              <p className="mt-1 text-sm text-gray-500">Enter a query above to search through your uploaded documents</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}