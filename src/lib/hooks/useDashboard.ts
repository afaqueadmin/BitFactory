import { useQuery } from "@tanstack/react-query";

export interface RecurringTemplateStats {
  total: number;
  active: number;
}

/** Row count for a recurring-invoices query, without fetching the rows. */
async function countRecurring(query: string): Promise<number> {
  const res = await fetch(
    `/api/accounting/recurring-invoices?page=1&limit=1${query}`,
    { method: "GET", credentials: "include" },
  );
  if (!res.ok) {
    throw new Error("Failed to fetch recurring invoices");
  }
  const data: { pagination: { total: number } } = await res.json();
  return data.pagination.total;
}

/** Hosting & Colocation's Recurring Templates cards. */
export function useRecurringTemplateStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["recurringTemplateStats"],
    queryFn: async (): Promise<RecurringTemplateStats> => {
      const [total, active] = await Promise.all([
        countRecurring(""),
        countRecurring("&isActive=true"),
      ]);
      return { total, active };
    },
  });

  return {
    stats: data ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
