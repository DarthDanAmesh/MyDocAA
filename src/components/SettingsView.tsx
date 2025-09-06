// src/components/SettingsView.tsx
'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface UsageData {
  uploads: number;
  quota: number;
  queries: number;
  last_updated: string;
}

interface UserSettings {
  api_key?: string;
  notification_preferences: {
    email: boolean;
    browser: boolean;
  };
  theme: 'light' | 'dark' | 'system';
}

export default function SettingsView() {
  const [apiKey, setApiKey] = useState('');
  const [usage, setUsage] = useState<UsageData>({ uploads: 0, quota: 10, queries: 0, last_updated: '' });
  const [settings, setSettings] = useState<UserSettings>({
    notification_preferences: {
      email: true,
      browser: true
    },
    theme: 'system'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'account' | 'api' | 'notifications'>('account');
  const { token, user, logout } = useAuth();
  const router = useRouter();

  // Fetch user settings and usage data on component mount
  useEffect(() => {
    if (token) {
      fetchUserSettings();
      fetchUsageData();
    }
  }, [token]);

  const fetchUserSettings = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        if (data.api_key) {
          setApiKey(data.api_key);
        }
      }
    } catch (error) {
      console.error('Error fetching user settings:', error);
    }
  };

  const fetchUsageData = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/settings/usage', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data: UsageData = await response.json();
        setUsage(data);
      }
    } catch (error) {
      console.error('Error fetching usage data:', error);
    }
  };

  const handleSaveApiKey = async () => {
    if (!token) return;
    
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ apiKey }),
      });
      
      if (response.ok) {
        // Update local settings
        setSettings(prev => ({ ...prev, api_key: apiKey }));
        alert('API key saved successfully');
      } else {
        const errorData = await response.json();
        alert(`Failed to save API key: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      alert('Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNotificationSettings = async () => {
    if (!token) return;
    
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ notification_preferences: settings.notification_preferences }),
      });
      
      if (response.ok) {
        alert('Notification settings saved successfully');
      } else {
        alert('Failed to save notification settings');
      }
    } catch (error) {
      console.error('Error saving notification settings:', error);
      alert('Failed to save notification settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTheme = async (theme: 'light' | 'dark' | 'system') => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/settings/theme', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ theme }),
      });
      
      if (response.ok) {
        setSettings(prev => ({ ...prev, theme }));
        // Apply theme to the page
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (theme === 'light') {
          document.documentElement.classList.remove('dark');
        } else {
          // System preference - match OS
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (prefersDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
      }
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleDeleteAccount = async () => {
    if (!token) return;
    
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      try {
        const response = await fetch('/api/user/delete', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          logout();
          router.push('/login');
        } else {
          alert('Failed to delete account');
        }
      } catch (error) {
        console.error('Error deleting account:', error);
        alert('Failed to delete account');
      }
    }
  };

  const getUsagePercentage = () => {
    return Math.min(100, (usage.uploads / usage.quota) * 100);
  };

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold mb-6">Settings</h2>
        
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('account')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'account'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Account
            </button>
            <button
              onClick={() => setActiveTab('api')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'api'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              API
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'notifications'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Notifications
            </button>
          </nav>
        </div>
        
        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Account Information</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Username</p>
                    <p className="font-medium">{user?.username}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium">{user?.email}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Theme</h3>
              <div className="flex space-x-4">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => handleSaveTheme(theme)}
                    className={`px-4 py-2 border rounded-md ${
                      settings.theme === theme
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {theme.charAt(0).toUpperCase() + theme.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Usage Limits</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Uploads: {usage.uploads} / {usage.quota}</span>
                    <span>{getUsagePercentage().toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ width: `${getUsagePercentage()}%` }}
                    ></div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {usage.quota - usage.uploads} uploads remaining this month
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  Queries: {usage.queries || 0}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Last updated: {usage.last_updated ? new Date(usage.last_updated).toLocaleDateString() : 'Unknown'}
                </p>
                <div className="mt-4">
                  <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    Upgrade to Pro for unlimited uploads and more features
                  </button>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Account Actions</h3>
              <div className="flex space-x-4">
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Logout
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="px-4 py-2 border border-red-300 rounded-md text-red-700 bg-white hover:bg-red-50"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* API Tab */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">API Key</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-4">
                  Add your API key for external AI services like OpenAI or Anthropic to enable additional features.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSaveApiKey}
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">API Documentation</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-4">
                  Use our REST API to integrate DocAA with your applications.
                </p>
                <div className="space-y-2">
                  <div className="text-sm">
                    <p className="font-medium">Authentication</p>
                    <p className="text-gray-600">Include your API key in the Authorization header:</p>
                    <code className="bg-gray-100 p-2 rounded text-xs block mt-1">Authorization: Bearer YOUR_API_KEY</code>
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">Endpoints</p>
                    <ul className="list-disc pl-5 text-gray-600 mt-1">
                      <li>POST /api/files - Upload a file</li>
                      <li>GET /api/files - List files</li>
                      <li>POST /api/chat - Send a chat message</li>
                      <li>POST /api/search - Search documents</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Notification Preferences</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Email Notifications</p>
                      <p className="text-sm text-gray-600">Receive notifications via email</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.notification_preferences.email}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          notification_preferences: {
                            ...prev.notification_preferences,
                            email: e.target.checked
                          }
                        }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Browser Notifications</p>
                      <p className="text-sm text-gray-600">Receive notifications in your browser</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.notification_preferences.browser}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          notification_preferences: {
                            ...prev.notification_preferences,
                            browser: e.target.checked
                          }
                        }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
                
                <div className="mt-6">
                  <button
                    onClick={handleSaveNotificationSettings}
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Preferences'}
                  </button>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Notification History</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-4">
                  Your recent notifications will appear here.
                </p>
                <div className="text-center py-8 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <p className="mt-2">No notifications yet</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}