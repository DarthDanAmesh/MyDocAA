// src/components/VerifyEmail.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function VerifyEmail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const token = searchParams.get('token');
    
    if (!token) {
      setIsError(true);
      setMessage('Invalid verification link');
      setIsLoading(false);
      return;
    }
    
    // Call your API to verify the email
    const verifyEmail = async () => {
      try {
        const response = await fetch(`/api/auth/verify-email?token=${token}`);
        const data = await response.json();
        
        if (response.ok) {
          setIsError(false);
          setMessage(data.message || 'Email verified successfully!');
        } else {
          setIsError(true);
          setMessage(data.detail || 'Email verification failed');
        }
      } catch (error) {
        setIsError(true);
        setMessage('An error occurred during email verification');
      } finally {
        setIsLoading(false);
      }
    };
    
    verifyEmail();
  }, [searchParams]);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg">
        {isLoading ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Verifying your email...</p>
          </div>
        ) : (
          <>
            <div className={`rounded-md p-4 ${isError ? 'bg-red-50' : 'bg-green-50'}`}>
              <div className="flex">
                <div className="flex-shrink-0">
                  {isError ? (
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div className="ml-3">
                  <h3 className={`text-sm font-medium ${isError ? 'text-red-800' : 'text-green-800'}`}>
                    {isError ? 'Verification Failed' : 'Verification Successful'}
                  </h3>
                  <div className={`mt-2 text-sm ${isError ? 'text-red-700' : 'text-green-700'}`}>
                    <p>{message}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 text-center">
              <Link href="/login" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black">
                Go to Login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}