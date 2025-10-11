import { useState, useEffect } from 'react';

interface UserData {
  name: string;
  email: string;
}

const CACHE_KEY = 'bitfactory_user_data';
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export function useUser() {
  const [user, setUser] = useState<UserData | null>(() => {
    // Try to load initial data from cache
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        // Return cached data if it's less than MAX_CACHE_AGE old
        if (age < MAX_CACHE_AGE) {
          return data;
        }
        localStorage.removeItem(CACHE_KEY); // Clear expired cache
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(!user); // Only show loading if we don't have cached data
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchUser = async () => {
      try {
        // Only show loading if we don't have cached data
        if (!user) {
          setLoading(true);
        }
        setError(null);

        const response = await fetch('/api/user/profile', {
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        const data = await response.json();

        // Handle 401 Unauthorized specifically
        if (response.status === 401) {
          // Clear cached data on auth error
          if (typeof window !== 'undefined') {
            localStorage.removeItem(CACHE_KEY);
          }
          setUser(null);
          // Don't throw error for auth issues, just set user to null
          return;
        }

        // Handle other error cases
        if (!response.ok) {
          console.error('Error fetching user data:', data.error);
          // For non-auth errors, try to use cached data if available
          const cached = typeof window !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
          if (cached) {
            const { data: cachedData, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            if (age < MAX_CACHE_AGE) {
              setUser(cachedData);
              return;
            }
          }
          throw new Error(data.error || 'Failed to fetch user data');
        }

        const userData = data.user;
        // Only update if component is still mounted
        if (isMounted) {
          setUser(userData);
          
          // Cache the user data with timestamp
          if (typeof window !== 'undefined') {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              data: userData,
              timestamp: Date.now()
            }));
          }
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch user data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Always fetch on mount to validate cached data
    fetchUser();

    // Cleanup function to prevent updates if component unmounts
    return () => {
      isMounted = false;
    };
  }, [user]); // Add user to dependency array to prevent unnecessary fetches

  // Add a method to clear the cache (useful for logout)
  const clearCache = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CACHE_KEY);
    }
    setUser(null);
  };

  return { user, loading, error, clearCache };
}