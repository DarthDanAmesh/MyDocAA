// src/components/Sidebar.tsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  activeView?: 'chat' | 'documents' | 'search' | 'settings';
  setActiveView?: (view: 'chat' | 'documents' | 'search' | 'settings') => void;
}

export default function Sidebar({ activeView, setActiveView }: SidebarProps) {
  const [fileCount, setFileCount] = useState(0);
  const { user, token, logout } = useAuth();
  const router = useRouter();
  
  const navItems = [
    { id: 'chat', label: 'Chat', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    { id: 'documents', label: 'Documents', icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { id: 'search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { id: 'settings', label: 'Settings', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
  ];

// Fetch file count
useEffect(() => {
  const fetchFileCount = async () => {
    if (!token) {
      console.log("Token missing. Skipping fetchFileCount.");
      return;
    }
    
    try {
      const response = await fetch('/api/files/', {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setFileCount(data.length || 0);
      } else if (response.status === 401) {
        console.warn("Unauthorized. Logging out.");
        logout();
      } else {
        console.error(`Error fetching file count: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching file count:', error);
    }
  };
  
  fetchFileCount();
}, [token, logout]);

  const handleNavClick = (view: 'chat' | 'documents' | 'search' | 'settings') => {
    if (setActiveView) {
      setActiveView(view);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-800">DocAA</h1>
        {user && (
          <div className="mt-2">
            <p className="text-sm text-gray-600">Welcome, {user.username}</p>
            <p className="text-xs text-gray-500">Files: {fileCount}</p>
          </div>
        )}
      </div>
      
      <nav className="flex-1 p-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavClick(item.id as any)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
              activeView === item.id 
                ? 'bg-gray-100 text-black font-medium' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {item.label}
          </button>
        ))}
      </nav>
      
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
    </div>
  );
}