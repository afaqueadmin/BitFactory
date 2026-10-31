import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  RepairChargeItem,
  RepairPriceType,
  RepairSite,
  RepairSiteSettingItem,
  RepairSiteSettingView,
} from "@/lib/repairCharges";

const QUERY_KEY = "repair-charges";

/** Active charges only, unless includeInactive (admin-only server-side). */
export function useRepairCharges(filters?: { includeInactive?: boolean }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [QUERY_KEY, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.includeInactive) params.append("includeInactive", "1");

      const res = await fetch(`/api/repair-charges?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch repair charges");
      }
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  return {
    charges: (data?.data?.charges as RepairChargeItem[]) || [],
    settings: (data?.data?.settings as RepairSiteSettingView[]) || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}

async function send(url: string, method: string, body?: object) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const resBody = await res.json().catch(() => ({}));
    throw new Error(resBody.error || "Failed to save repair charge");
  }
  return res.json();
}

export interface RepairChargeFormInput {
  site: RepairSite;
  repairType: string;
  priceType: RepairPriceType;
  amount: number | null;
  amountMax: number | null;
  note: string | null;
  linkUrl: string | null;
  isActive?: boolean;
}

export function useManageRepairCharges() {
  const queryClient = useQueryClient();
  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
  };

  const createMutation = useMutation({
    mutationFn: (input: RepairChargeFormInput) =>
      send("/api/repair-charges", "POST", input),
    onSettled,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & Partial<Omit<RepairChargeFormInput, "site">>) =>
      send(`/api/repair-charges/${id}`, "PUT", body),
    onSettled,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => send(`/api/repair-charges/${id}`, "DELETE"),
    onSettled,
  });

  const reorderMutation = useMutation({
    mutationFn: (input: { site: RepairSite; ids: string[] }) =>
      send("/api/repair-charges/reorder", "PUT", input),
    onSettled,
  });

  const saveSettingMutation = useMutation({
    mutationFn: (input: RepairSiteSettingItem) =>
      send("/api/repair-charges/site-settings", "PUT", input),
    onSettled,
  });

  return {
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    reorder: reorderMutation.mutateAsync,
    saveSetting: saveSettingMutation.mutateAsync,
    savingSetting: saveSettingMutation.isPending,
    busy:
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending ||
      reorderMutation.isPending,
  };
}
