import { useQuery } from "@tanstack/react-query";

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
  idNumber: string | null;
  companyUrl: string | null;
  profileImage: string | null;
  profileImageId: string | null;
  role: "ADMIN" | "SUPER_ADMIN" | "CLIENT";
}

interface UserResponse {
  user: UserData;
  recentActivities: UserActivity[];
}

export function useUser() {
  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery<UserResponse>({
    queryKey: ["user"],
    queryFn: async () => {
      try {
        console.log("Starting user fetch process...");

        // First verify the auth status
        const authCheck = await fetch("/api/auth/check", {
          credentials: "include",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        console.log("Auth Check Status:", authCheck.status);
        console.log(
          "Auth Check Headers:",
          Object.fromEntries(authCheck.headers.entries()),
        );

        // Get auth check response as text first
        const authCheckText = await authCheck.text();
        console.log("Auth Check Raw Response:", authCheckText);

        // Try to parse the auth check response
        let authData;
        try {
          authData = JSON.parse(authCheckText);
        } catch (e) {
          console.error("Failed to parse auth check response:", e);
          throw new Error("Invalid authentication response");
        }

        // Check if auth was successful
        if (!authCheck.ok || !authData.isAuthenticated) {
          throw new Error(authData.error || "Authentication failed");
        }

        // Then fetch the user profile
        console.log("Fetching user profile...");
        const profileResponse = await fetch("/api/user/profile", {
          credentials: "include",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        console.log("Profile Response Status:", profileResponse.status);
        console.log(
          "Profile Response Headers:",
          Object.fromEntries(profileResponse.headers.entries()),
        );

        // Get profile response as text first
        const profileText = await profileResponse.text();
        console.log("Profile Raw Response:", profileText);

        // Try to parse the profile response
        let profileData;
        try {
          profileData = JSON.parse(profileText);
        } catch (e) {
          console.error("Failed to parse profile response:", e);
          throw new Error("Invalid profile response");
        }

        if (!profileResponse.ok) {
          throw new Error(profileData.error || "Failed to fetch user data");
        }

        if (!profileData.user) {
          throw new Error("User data is missing from response");
        }

        return {
          user: profileData.user,
          recentActivities: profileData.recentActivities || [],
        };
      } catch (err) {
        console.error("Error in user fetch process:", err);
        throw err;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  return {
    user: data?.user || null,
    recentActivities: data?.recentActivities || [],
    loading,
    error: queryError?.message || null,
  };
}
