//page.tsx

'use client';

import { useState } from 'react';
import ChatInterface from '../components/ChatInterface';
import DocumentsView from '../components/DocumentsView';
import SearchView from '../components/SearchView';
import SettingsView from '../components/SettingsView';

export default function Home() {
  const [activeView, setActiveView] = useState<
    'chat' | 'documents' | 'search' | 'settings'
  >('chat');

  return (
    <main className="h-screen">
      {activeView === 'chat' && <ChatInterface />}
      {activeView === 'documents' && <DocumentsView />}
      {activeView === 'search' && <SearchView />}
      {activeView === 'settings' && <SettingsView />}
    </main>
  );
}