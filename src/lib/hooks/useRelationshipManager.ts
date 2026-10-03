import { useQuery } from "@tanstack/react-query";

export interface RelationshipManager {
  name: string;
  email: string | null;
}

/** The signed-in customer's relationship manager, or null if none assigned. */
export function useRelationshipManager() {
  const { data, isLoading } = useQuery<{ rm: RelationshipManager | null }>({
    queryKey: ["relationship-manager"],
    queryFn: async () => {
      const res = await fetch("/api/user/relationship-manager", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch relationship manager");
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  return { rm: data?.rm ?? null, loading: isLoading };
}
