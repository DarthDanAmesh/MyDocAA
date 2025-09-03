'use client';

import { useState } from 'react';

export default function SettingsView() {
  const [apiKey, setApiKey] = useState('');
  const [usage, setUsage] = useState({ uploads: 0, quota: 10 }); // Fetch from backend

  const handleSaveApiKey = async () => {
    try {
      await fetch('/api/settings/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey }),
      });
      alert('API key saved');
    } catch (error) {
      console.error('Error saving API key:', error);
      alert('Failed to save API key');
    }
  };

  // Fetch usage data (implement in backend)
  // useEffect(() => {
  //   fetch('/api/settings/usage', { headers: { Authorization: `Bearer ${token}` } })
  //     .then(res => res.json())
  //     .then(data => setUsage(data));
  // }, []);

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Settings</h2>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key (OpenAI/Anthropic)
          </label>
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
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Save
            </button>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">Usage Limits</h3>
          <p className="text-sm text-gray-600">
            Uploads: {usage.uploads} / {usage.quota} (Free Tier)
          </p>
          <p className="text-sm text-gray-600 mt-2">
            Upgrade to Pro for unlimited uploads and more features.
          </p>
        </div>
      </div>
    </div>
  );
}