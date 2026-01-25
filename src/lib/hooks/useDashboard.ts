import { useState, useEffect } from "react";
import { InvoiceStatus } from "@/generated/prisma";

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  userId: string;
  totalAmount: string | number;
  status: InvoiceStatus;
  dueDate: string;
  createdAt: string;
  issuedDate: string | null;
  user?: {
    name: string | null;
  };
}

interface RecurringInvoiceData {
  id: string;
  isActive: boolean;
}

interface InvoicesResponse {
  invoices: InvoiceData[];
  pagination: {
    total: number;
  };
}

interface RecurringResponse {
  recurringInvoices: RecurringInvoiceData[];
  pagination: {
    total: number;
  };
}

export interface DashboardStats {
  totalInvoices: number;
  unpaidInvoices: number;
  overdueInvoices: number;
  totalOutstanding: number;
  recurringInvoices: {
    total: number;
    active: number;
  };
  upcomingInvoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    amount: number;
    dueDate: string;
    daysUntilDue: number;
    issuedDate: string;
    status: InvoiceStatus;
  }>;
  recentInvoices: Array<{
    invoiceId: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    amount: number;
    dueDate: string;
    daysUntilDue: number;
    issuedDate: string;
    status: InvoiceStatus;
  }>;
}

export function useDashboardStats() {
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch invoices
      const invoicesRes = await fetch(
        "/api/accounting/invoices?page=1&limit=100",
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!invoicesRes.ok) {
        throw new Error("Failed to fetch invoices");
      }

      const invoicesData: InvoicesResponse = await invoicesRes.json();

      // Fetch recurring invoices
      const recurringRes = await fetch(
        "/api/accounting/recurring-invoices?page=1&limit=100",
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!recurringRes.ok) {
        throw new Error("Failed to fetch recurring invoices");
      }

      const recurringData: RecurringResponse = await recurringRes.json();

      // All invoices for counts (including CANCELLED)
      const allInvoices = invoicesData.invoices || [];
      // Non-cancelled invoices for financial calculations only
      const activeInvoices = allInvoices.filter(
        (inv: InvoiceData) => inv.status !== InvoiceStatus.CANCELLED,
      );
      const now = new Date();

      const stats: DashboardStats = {
        totalInvoices: allInvoices.length,
        unpaidInvoices: allInvoices.filter(
          (inv: InvoiceData) => inv.status !== InvoiceStatus.PAID,
        ).length,
        overdueInvoices: allInvoices.filter(
          (inv: InvoiceData) =>
            inv.status !== InvoiceStatus.PAID && new Date(inv.dueDate) < now,
        ).length,
        totalOutstanding: activeInvoices
          .filter((inv: InvoiceData) => inv.status !== InvoiceStatus.PAID)
          .reduce(
            (sum: number, inv: InvoiceData) => sum + Number(inv.totalAmount),
            0,
          ),
        recurringInvoices: {
          total: recurringData.pagination.total,
          active: (recurringData.recurringInvoices || []).filter(
            (r: RecurringInvoiceData) => r.isActive,
          ).length,
        },
        upcomingInvoices: activeInvoices
          .filter((inv: InvoiceData) => new Date(inv.dueDate) >= now)
          .sort(
            (a: InvoiceData, b: InvoiceData) =>
              new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
          )
          .slice(0, 5)
          .map((inv: InvoiceData) => {
            const daysUntilDue = Math.ceil(
              (new Date(inv.dueDate).getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24),
            );
            return {
              invoiceId: inv.id,
              invoiceNumber: inv.invoiceNumber,
              customerId: inv.userId,
              customerName:
                inv.user?.name || `Customer ${inv.userId.slice(0, 8)}`,
              amount: Number(inv.totalAmount),
              dueDate: inv.dueDate,
              daysUntilDue,
              issuedDate: inv.issuedDate || inv.createdAt,
              status: inv.status as InvoiceStatus,
            };
          }),
        recentInvoices: activeInvoices
          .sort(
            (a: InvoiceData, b: InvoiceData) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .slice(0, 5)
          .map((inv: InvoiceData) => {
            const daysUntilDue = Math.ceil(
              (new Date(inv.dueDate).getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24),
            );
            return {
              invoiceId: inv.id,
              invoiceNumber: inv.invoiceNumber,
              customerId: inv.userId,
              customerName:
                inv.user?.name || `Customer ${inv.userId.slice(0, 8)}`,
              amount: Number(inv.totalAmount),
              dueDate: inv.dueDate,
              daysUntilDue,
              issuedDate: inv.issuedDate || inv.createdAt,
              status: inv.status as InvoiceStatus,
            };
          }),
      };

      setDashboard(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const refetch = () => {
    fetchDashboard();
  };

  return { dashboard, loading, error, refetch };
}
