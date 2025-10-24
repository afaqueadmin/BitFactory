import { useState, useEffect } from 'react';

interface UserActivity {
  id: string;
  type: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

interface UserData {
  id?: string;
  name: string | null;
  email: string;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  country: string | null;
  city: string | null;
  streetAddress: string | null;
  companyName: string | null;
  vatNumber: string | null;
  profileImage: string | null;
  profileImageId: string | null;
}

export function useUser() {
  const [user, setUser] = useState<UserData | null>(null);
  const [recentActivities, setRecentActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/user/profile', {
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch user data');
        }

        setUser(data.user);
        setRecentActivities(data.recentActivities || []);
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch user data');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  return { user, recentActivities, loading, error };
}