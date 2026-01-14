import { useState, useEffect } from "react";
import { RecurringInvoice } from "@/generated/prisma";

export interface RecurringInvoiceWithDetails extends RecurringInvoice {
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
}

export function useRecurringInvoices(
  page: number = 1,
  limit: number = 10,
  customerId?: string,
  isActive?: boolean,
) {
  const [recurringInvoices, setRecurringInvoices] = useState<
    RecurringInvoiceWithDetails[]
  >([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecurringInvoices = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.append("page", page.toString());
        params.append("limit", limit.toString());
        if (customerId) params.append("customerId", customerId);
        if (isActive !== undefined)
          params.append("isActive", isActive.toString());

        const res = await fetch(
          `/api/accounting/recurring-invoices?${params}`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        if (!res.ok) {
          throw new Error("Failed to fetch recurring invoices");
        }

        const data = await res.json();
        setRecurringInvoices(data.recurringInvoices);
        setTotal(data.pagination.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchRecurringInvoices();
  }, [page, limit, customerId, isActive]);

  return { recurringInvoices, total, loading, error };
}

export function useRecurringInvoice(id: string) {
  const [recurringInvoice, setRecurringInvoice] =
    useState<RecurringInvoiceWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchRecurringInvoice = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/accounting/recurring-invoices/${id}`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch recurring invoice");
        }

        const data = await res.json();
        setRecurringInvoice(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchRecurringInvoice();
  }, [id]);

  const updateRecurringInvoice = async (
    updates: Partial<RecurringInvoiceWithDetails>,
  ) => {
    try {
      const res = await fetch(`/api/accounting/recurring-invoices/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error("Failed to update recurring invoice");
      }

      const data = await res.json();
      setRecurringInvoice(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    }
  };

  const deleteRecurringInvoice = async () => {
    try {
      const res = await fetch(`/api/accounting/recurring-invoices/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete recurring invoice");
      }

      return await res.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    }
  };

  return {
    recurringInvoice,
    loading,
    error,
    updateRecurringInvoice,
    deleteRecurringInvoice,
  };
}

export function useCreateRecurringInvoice() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (data: {
    customerId: string;
    dayOfMonth: number;
    unitPrice?: number;
    startDate: string;
    endDate?: string;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/accounting/recurring-invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create recurring invoice");
      }

      return await res.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { create, loading, error };
}
