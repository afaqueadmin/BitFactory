import { useState, useEffect } from "react";
import { InvoiceStatus } from "@/generated/prisma";

export interface InvoiceStatement {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceGeneratedDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  status: InvoiceStatus;
  issuedDate: string | null;
  paidDate: string | null;
  invoiceType: string;
}

export interface AccountStatement {
  period: {
    from: string;
    to: string;
  };
  customer: {
    id: string;
    email: string;
    name: string | null;
    companyName: string | null;
  };
  stats: {
    totalInvoices: number;
    totalAmount: number;
    totalPaid: number;
    totalPending: number;
    invoicesByStatus: Record<string, number>;
  };
  invoices: InvoiceStatement[];
}

export function useAccountStatement(
  customerId: string,
  fromDate?: string,
  toDate?: string,
) {
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;

    const fetchStatement = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.append("customerId", customerId);
        if (fromDate) params.append("fromDate", fromDate);
        if (toDate) params.append("toDate", toDate);

        const res = await fetch(`/api/accounting/statements?${params}`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch statement");
        }

        const data = await res.json();
        setStatement(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchStatement();
  }, [customerId, fromDate, toDate]);

  return { statement, loading, error };
}

export interface CustomerStatementSummary {
  customerId: string;
  customerName: string | null;
  customerEmail: string;
  companyName: string | null;
  totalInvoices: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  lastPaymentDate: string | null;
}

export function useCustomerStatements(page: number = 1, pageSize: number = 10) {
  const [customers, setCustomers] = useState<CustomerStatementSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.append("page", page.toString());
        params.append("pageSize", pageSize.toString());

        const res = await fetch(
          `/api/accounting/statements/customers?${params}`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        if (!res.ok) {
          throw new Error("Failed to fetch customer statements");
        }

        const data = await res.json();
        setCustomers(data.customers || []);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, [page, pageSize]);

  return { customers, total, loading, error };
}

export function useGenerateInvoice() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (data: {
    customerId: string;
    month: number;
    year: number;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/accounting/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate invoice");
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

  return { generate, loading, error };
}
