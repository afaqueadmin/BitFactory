import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Invoice,
  InvoiceStatus,
  CostPayment,
  AuditLog,
} from "@/generated/prisma";

export interface AuditLogWithUser extends AuditLog {
  user?: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface InvoiceWithDetails extends Invoice {
  user?: {
    id: string;
    email: string;
    name: string | null;
  };
  createdByUser?: {
    id: string;
    email: string;
    name: string | null;
  };
  costPayments?: CostPayment[];
}

export function useInvoices(
  page: number = 1,
  limit: number = 10,
  customerId?: string,
  status?: InvoiceStatus,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices", page, limit, customerId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", limit.toString());
      if (customerId) params.append("customerId", customerId);
      if (status) params.append("status", status);

      const res = await fetch(`/api/accounting/invoices?${params}`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to fetch invoices");
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    invoices: data?.invoices || [],
    total: data?.pagination?.total || 0,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}

export function useInvoice(id: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const res = await fetch(`/api/accounting/invoices/${id}`, {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to fetch invoice");
      }

      return res.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async (updates: Partial<InvoiceWithDetails>) => {
      const res = await fetch(`/api/accounting/invoices/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error("Failed to update invoice");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["invoice", id], data);
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/accounting/invoices/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete invoice");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    invoice: data || null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    updateInvoice: updateInvoiceMutation.mutateAsync,
    deleteInvoice: deleteInvoiceMutation.mutateAsync,
  };
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (invoiceData: {
      customerId: string;
      totalMiners: number;
      unitPrice: number;
      dueDate: string;
      status?: InvoiceStatus;
    }) => {
      const res = await fetch("/api/accounting/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create invoice");
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
    error: mutation.error instanceof Error ? mutation.error.message : null,
  };
}

export interface Customer {
  id: string;
  displayName: string; // "John Doe (Mining-Account-1)"
  name: string | null;
  luxorSubaccountName: string | null;
}

export function useCustomers() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const res = await fetch("/api/accounting/customers", {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to fetch customers");
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    customers: data?.customers || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}

export interface Miner {
  id: string;
  name: string;
  status: string;
}

export function useCustomerMiners(customerId?: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["customerMiners", customerId],
    queryFn: async () => {
      const res = await fetch(
        `/api/accounting/miners?customerId=${customerId}&status=Auto`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!res.ok) {
        throw new Error("Failed to fetch miners");
      }

      return res.json();
    },
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    miners: data?.miners || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      invoiceId,
      data,
    }: {
      invoiceId: string;
      data: {
        totalMiners: number;
        unitPrice: number;
        dueDate: string;
      };
    }) => {
      const res = await fetch(`/api/accounting/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error("Failed to update invoice");
      }

      return await res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["invoice", variables.invoiceId], data);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    update: async (
      invoiceId: string,
      data: {
        totalMiners: number;
        unitPrice: number;
        dueDate: string;
      },
    ) => mutation.mutateAsync({ invoiceId, data }),
    loading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
  };
}
export function useInvoiceAuditLog(invoiceId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["invoiceAuditLog", invoiceId],
    queryFn: async () => {
      const res = await fetch(
        `/api/accounting/invoices/${invoiceId}/audit-log`,
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!res.ok) {
        throw new Error("Failed to fetch audit logs");
      }

      return await res.json();
    },
    enabled: !!invoiceId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    auditLogs: data || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  };
}

export function useSendInvoiceEmail() {
  const mutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch(
        `/api/accounting/invoices/${invoiceId}/send-email`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to send email");
      }

      return await res.json();
    },
  });

  return {
    sendEmail: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
  };
}
export function useRecordPayment() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      invoiceId,
      data,
    }: {
      invoiceId: string;
      data: {
        amountPaid: number;
        paymentDate: string;
        notes?: string;
      };
    }) => {
      const res = await fetch(
        `/api/accounting/invoices/${invoiceId}/record-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        },
      );

      if (!res.ok) {
        throw new Error("Failed to record payment");
      }

      return await res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["invoice", variables.invoiceId], data);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    recordPayment: (
      invoiceId: string,
      data: {
        amountPaid: number;
        paymentDate: string;
        notes?: string;
        markAsPaid?: boolean;
      },
    ) => mutation.mutateAsync({ invoiceId, data }),
    loading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
  };
}

export function useChangeInvoiceStatus() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      invoiceId,
      status,
    }: {
      invoiceId: string;
      status: "ISSUED" | "PAID" | "CANCELLED" | "OVERDUE";
    }) => {
      const res = await fetch(`/api/accounting/invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to change invoice status");
      }

      return await res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(["invoice", variables.invoiceId], data);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    changeStatus: (
      invoiceId: string,
      status: "ISSUED" | "PAID" | "CANCELLED" | "OVERDUE",
    ) => mutation.mutateAsync({ invoiceId, status }),
    loading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
  };
}
export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch(`/api/accounting/invoices/${invoiceId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete invoice");
      }

      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  return {
    deleteInvoice: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
  };
}

export function useBulkSendInvoiceEmail() {
  const mutation = useMutation({
    mutationFn: async (invoiceIds: string[]) => {
      const res = await fetch("/api/accounting/invoices/bulk-send-email", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invoiceIds }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to send emails");
      }

      return await res.json();
    },
  });

  return {
    bulkSendEmail: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
  };
}
