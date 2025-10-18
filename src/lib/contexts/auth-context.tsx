'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Check authentication status when component mounts
  useEffect(() => {
    checkAuth();
  }, []);

  // Periodically check auth status to ensure token hasn't expired
  useEffect(() => {
    const interval = setInterval(checkAuth, 5 * 60 * 1000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const MAX_RETRIES = 2;
  const RETRY_DELAY = 1000; // 1 second

  const checkAuth = async (retryCount = 0) => {
    try {
      // Only proceed if we're not already checking auth
      if (isLoading) return;
      setIsLoading(true);

      // First check auth status with no-cache headers
      const authCheck = await fetch('/api/auth/check', {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      const authData = await authCheck.json();

      if (!authCheck.ok) {
        // If token expired but we have refresh token, it will be handled by the check endpoint
        if (authCheck.status === 401 && retryCount < MAX_RETRIES) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          return checkAuth(retryCount + 1);
        }

        setUser(null);
        // Only redirect to login if we're not already there and not on the public home page
        if (!window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
          router.replace('/login');
        }
        return;
      }

      // Update user state from auth check response
      if (authData.user) {
        setUser(authData.user);
      } else {
        // This shouldn't happen, but handle it just in case
        console.error('No user data in successful auth check response');
        setUser(null);
        if (!window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
          router.replace('/login');
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      if (!window.location.pathname.startsWith('/login') && window.location.pathname !== '/') {
        router.replace('/login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Prevent caching of login requests
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error types
        if (response.status === 401) {
          throw new Error('Invalid email or password');
        } else if (response.status === 429) {
          throw new Error('Too many login attempts. Please try again later.');
        } else {
          throw new Error(data.error || 'Login failed');
        }
      }

      setUser(data.user);
      
      // Update router state and navigation
      router.refresh();
      
      // Use replace instead of push to prevent back navigation to login
      router.replace(data.redirectUrl || '/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      // Only throw user-facing errors
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error('An unexpected error occurred during login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      // Clear user state first to prevent any authenticated requests
      setUser(null);

      // Clear router cache
      router.refresh();

      // Attempt server-side logout
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        console.error('Server-side logout failed:', response.status);
        // Continue with client-side logout even if server-side fails
      }

      // Clear any client-side storage (if any is used in the future)
      localStorage.clear();
      sessionStorage.clear();

      // Wait for state updates and storage clearing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Force a hard navigation to login to clear all React state
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      // Even if there's an error, ensure the user is logged out client-side
      window.location.href = '/login';
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}