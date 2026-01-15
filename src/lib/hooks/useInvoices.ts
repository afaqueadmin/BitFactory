import { useState, useEffect } from "react";
import { Invoice, InvoiceStatus, InvoicePayment } from "@/generated/prisma";

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
  payments?: InvoicePayment[];
}

export function useInvoices(
  page: number = 1,
  limit: number = 10,
  customerId?: string,
  status?: InvoiceStatus,
) {
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        setError(null);

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

        const data = await res.json();
        setInvoices(data.invoices);
        setTotal(data.pagination.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, [page, limit, customerId, status]);

  return { invoices, total, loading, error };
}

export function useInvoice(id: string) {
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchInvoice = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/accounting/invoices/${id}`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch invoice");
        }

        const data = await res.json();
        setInvoice(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [id]);

  const updateInvoice = async (updates: Partial<InvoiceWithDetails>) => {
    try {
      const res = await fetch(`/api/accounting/invoices/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error("Failed to update invoice");
      }

      const data = await res.json();
      setInvoice(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    }
  };

  const deleteInvoice = async () => {
    try {
      const res = await fetch(`/api/accounting/invoices/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to delete invoice");
      }

      return await res.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    }
  };

  return { invoice, loading, error, updateInvoice, deleteInvoice };
}

export function useCreateInvoice() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (invoiceData: {
    customerId: string;
    totalMiners: number;
    unitPrice: number;
    dueDate: string;
    status?: InvoiceStatus;
  }) => {
    try {
      setLoading(true);
      setError(null);

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

export interface Customer {
  id: string;
  displayName: string; // "John Doe (Mining-Account-1)"
  name: string | null;
  luxorSubaccountName: string | null;
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/accounting/customers", {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch customers");
        }

        const data = await res.json();
        setCustomers(data.customers || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  return { customers, loading, error };
}

export interface Miner {
  id: string;
  name: string;
  status: string;
}

export function useCustomerMiners(customerId?: string) {
  const [miners, setMiners] = useState<Miner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) {
      setMiners([]);
      return;
    }

    const fetchMiners = async () => {
      try {
        setLoading(true);
        setError(null);

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

        const data = await res.json();
        setMiners(data.miners || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setMiners([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMiners();
  }, [customerId]);

  return { miners, loading, error };
}

export function useUpdateInvoice() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = async (
    invoiceId: string,
    data: {
      totalMiners: number;
      unitPrice: number;
      dueDate: string;
    },
  ) => {
    try {
      setLoading(true);
      setError(null);

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
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { update, loading, error };
}

export function useRecordPayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordPayment = async (
    invoiceId: string,
    data: {
      amountPaid: number;
      paymentDate: string;
      notes?: string;
    },
  ) => {
    try {
      setLoading(true);
      setError(null);

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
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { recordPayment, loading, error };
}

export function useChangeInvoiceStatus() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeStatus = async (
    invoiceId: string,
    status: "ISSUED" | "PAID" | "CANCELLED" | "OVERDUE",
  ) => {
    try {
      setLoading(true);
      setError(null);

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
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { changeStatus, loading, error };
}
