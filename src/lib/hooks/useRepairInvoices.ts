import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** A miner as returned by /api/accounting/repair-miners (REPAIR_MINER_SELECT). */
export interface RepairMiner {
  id: string;
  name: string;
  serialNumber: string | null;
  status?: string;
  hardware: { model: string } | null;
  space: { name: string; location: string } | null;
}

export interface RepairLineItemDraft {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface RepairInvoiceInput {
  minerId: string;
  lineItems: RepairLineItemDraft[];
  discountAmount: number;
  repairNote: string;
  dueDate: string;
  invoiceGeneratedDate?: string;
  machineHostingLocation?: string[];
}

/** "Space name (location)" for a miner, or "—". */
export const repairMinerLocation = (miner: Pick<RepairMiner, "space">) =>
  miner.space ? `${miner.space.name} (${miner.space.location})` : "—";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

/** All non-deleted miners of a customer, any status. */
export function useRepairMiners(customerId?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["repairMiners", customerId],
    queryFn: async () => {
      const res = await fetch(
        `/api/accounting/repair-miners?customerId=${encodeURIComponent(customerId as string)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        throw new Error(await readError(res, "Failed to fetch miners"));
      }
      return res.json();
    },
    enabled: !!customerId,
    staleTime: 60 * 1000,
  });

  return {
    miners: (data?.miners || []) as RepairMiner[],
    loading: isLoading && !!customerId,
    error: error instanceof Error ? error.message : null,
  };
}

export function useCreateRepairInvoice() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: RepairInvoiceInput & { customerId: string }) => {
      const res = await fetch("/api/accounting/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, invoiceType: "HARDWARE_REPAIR" }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, "Failed to create invoice"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    create: mutation.mutateAsync,
    loading: mutation.isPending,
  };
}

export function useUpdateRepairInvoice() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({
      invoiceId,
      data,
    }: {
      invoiceId: string;
      data: RepairInvoiceInput;
    }) => {
      const res = await fetch(`/api/accounting/invoices/${invoiceId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        throw new Error(await readError(res, "Failed to update invoice"));
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["invoice", variables.invoiceId], data);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    update: (invoiceId: string, data: RepairInvoiceInput) =>
      mutation.mutateAsync({ invoiceId, data }),
    loading: mutation.isPending,
  };
}
