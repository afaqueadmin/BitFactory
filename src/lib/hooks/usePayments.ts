import { useState, useEffect } from "react";
import { InvoicePayment } from "@/generated/prisma";

export interface InvoicePaymentWithDetails extends InvoicePayment {
  invoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
    totalAmount: number;
  };
  costPayment?: Record<string, unknown>;
}

export function useInvoicePayments(
  page: number = 1,
  limit: number = 10,
  invoiceId?: string,
) {
  const [payments, setPayments] = useState<InvoicePaymentWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.append("page", page.toString());
        params.append("limit", limit.toString());
        if (invoiceId) params.append("invoiceId", invoiceId);

        const res = await fetch(`/api/accounting/payments?${params}`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch payments");
        }

        const data = await res.json();
        setPayments(data.payments);
        setTotal(data.pagination.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [page, limit, invoiceId]);

  return { payments, total, loading, error };
}

export function useInvoicePayment(id: string) {
  const [payment, setPayment] = useState<InvoicePaymentWithDetails | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchPayment = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/accounting/payments/${id}`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch payment");
        }

        const data = await res.json();
        setPayment(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchPayment();
  }, [id]);

  const deletePayment = async () => {
    try {
      const res = await fetch(`/api/accounting/payments/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete payment");
      }

      return await res.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    }
  };

  return { payment, loading, error, deletePayment };
}

export function useRecordPayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = async (data: {
    invoiceId: string;
    costPaymentId: string;
    amountPaid: number;
    paidDate: string;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/accounting/payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to record payment");
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

  return { record, loading, error };
}
