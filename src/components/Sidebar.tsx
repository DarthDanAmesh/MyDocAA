// src/components/Sidebar.tsx
'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export type ViewType = 'chat' | 'documents' | 'search' | 'settings';

interface SidebarProps {
  activeView?: ViewType;
  setActiveView?: (view: ViewType) => void;
}

interface NavItem {
  id: ViewType;
  label: string;
  icon: string;
  badge?: number;
}

export default function Sidebar({ activeView, setActiveView }: SidebarProps) {
  const [fileCount, setFileCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, token, logout } = useAuth();
  const router = useRouter();
  
  const navItems: NavItem[] = useMemo(() => [
    { 
      id: 'chat', 
      label: 'Chat', 
      icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' 
    },
    { 
      id: 'documents', 
      label: 'Documents', 
      icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
      badge: fileCount > 0 ? fileCount : undefined
    },
    { 
      id: 'search', 
      label: 'Search', 
      icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' 
    },
    { 
      id: 'settings', 
      label: 'Settings', 
      icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' 
    },
  ], [fileCount]);

  useEffect(() => {
    const fetchFileCount = async () => {
      if (!token) {
        console.log("Token missing. User may not be authenticated.");
        setFileCount(0);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      setError(null);
      
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
          console.warn("Unauthorized. User may need to re-authenticate.");
          setError("Authentication required");
          // Auto-logout on 401
          setTimeout(() => {
            logout();
            router.push('/login');
          }, 1000);
        } else {
          const errorText = await response.text();
          console.error(`Error fetching file count: ${response.status} - ${errorText}`);
          setError(`Failed to load files (${response.status})`);
        }
      } catch (error) {
        console.error('Error fetching file count:', error);
        setError("Network error");
      } finally {
        setLoading(false);
      }
    };
    
    fetchFileCount();
  }, [token, logout, router]);

  const handleNavClick = useCallback((view: ViewType) => {
    if (setActiveView) {
      setActiveView(view);
    } else {
      // Fallback navigation if setActiveView is not provided
      router.push(`/${view}`);
    }
  }, [setActiveView, router]);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      // Force logout even if API call fails
      router.push('/login');
    }
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className={`bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-64'}`}>
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        {!isCollapsed && (
          <h1 className="text-xl font-semibold text-gray-800">DocAA</h1>
        )}
        <button
          onClick={toggleCollapse}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg 
            className="w-5 h-5 text-gray-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            {isCollapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            )}
          </svg>
        </button>
      </div>
      
      {!isCollapsed && user && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-sm font-medium text-gray-600">
                {user.username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.username}
              </p>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <span>Files:</span>
                {loading ? (
                  <span className="animate-pulse">Loading...</span>
                ) : error ? (
                  <span title={error} className="text-red-500">Error</span>
                ) : (
                  <span>{fileCount}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <nav className="flex-1 p-2" aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNavClick(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors relative ${
              activeView === item.id 
                ? 'bg-gray-100 text-black font-medium' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            aria-current={activeView === item.id ? 'page' : undefined}
            title={isCollapsed ? item.label : undefined}
          >
            <svg 
              className="w-5 h-5 flex-shrink-0" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {!isCollapsed && (
              <>
                <span className="truncate">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-blue-600 rounded-full">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </nav>
      
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? "Logout" : undefined}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}