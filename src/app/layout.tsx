// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '../components/Sidebar';
import { AuthProvider } from '@/contexts/AuthContext'; // Import AuthProvider
const inter = Inter({ subsets: ['latin'] });
export const metadata: Metadata = {
  title: 'DocAA - AI Document Assistant',
  description: 'A multimodal AI assistant for document processing and chat',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider> {/* Wrap your app with AuthProvider */}
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}