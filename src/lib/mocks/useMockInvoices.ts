/**
 * Mock Invoice Hook
 *
 * React hook that provides invoice data during Phase 2 UI development.
 * No API calls - all data is generated client-side using mock generators.
 *
 * In Phase 4, this will be replaced with real API calls.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Invoice,
  InvoiceStatus,
  RecurringInvoice,
  CustomerPricingConfig,
  DashboardResponse,
} from "@/lib/types/invoice";
import {
  generateMockInvoices,
  generateMockRecurringInvoices,
  generateMockPricingConfigs,
  isInvoiceOverdue,
  calculateDaysUntilDue,
} from "./invoiceMocks";

interface UseMockInvoicesReturn {
  invoices: Invoice[];
  recurringInvoices: RecurringInvoice[];
  pricingConfigs: CustomerPricingConfig[];
  dashboard: DashboardResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook: Fetch all invoice-related mock data
 *
 * Usage:
 * const { invoices, dashboard, loading } = useMockInvoices();
 */
export function useMockInvoices(): UseMockInvoicesReturn {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [recurringInvoices, setRecurringInvoices] = useState<
    RecurringInvoice[]
  >([]);
  const [pricingConfigs, setPricingConfigs] = useState<CustomerPricingConfig[]>(
    [],
  );
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Generate mock data
      const mockInvoices = generateMockInvoices(20);
      const mockRecurring = generateMockRecurringInvoices(5);
      const mockPricing = generateMockPricingConfigs(8);

      setInvoices(mockInvoices);
      setRecurringInvoices(mockRecurring);
      setPricingConfigs(mockPricing);

      // Build dashboard response
      const dashboardData = buildDashboardResponse(mockInvoices, mockRecurring);
      setDashboard(dashboardData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load invoice data",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateData();
  }, []);

  return {
    invoices,
    recurringInvoices,
    pricingConfigs,
    dashboard,
    loading,
    error,
    refetch: generateData,
  };
}

interface UseMockInvoicesPageReturn {
  invoices: Invoice[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  goToPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
}

/**
 * Hook: Fetch paginated invoice list
 *
 * Usage:
 * const { invoices, page, goToPage, loading } = useMockInvoicesPage(1, 10);
 */
export function useMockInvoicesPage(
  initialPage: number = 1,
  pageSize: number = 10,
): UseMockInvoicesPageReturn {
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Generate all invoices
        const invoices = generateMockInvoices(50);
        setAllInvoices(invoices);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load invoices",
        );
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedInvoices = allInvoices.slice(startIndex, endIndex);
  const totalPages = Math.ceil(allInvoices.length / pageSize);

  return {
    invoices: paginatedInvoices,
    total: allInvoices.length,
    page,
    pageSize,
    loading,
    error,
    goToPage: (newPage: number) => {
      const validPage = Math.max(1, Math.min(newPage, totalPages));
      setPage(validPage);
    },
    nextPage: () => {
      if (page < totalPages) setPage(page + 1);
    },
    previousPage: () => {
      if (page > 1) setPage(page - 1);
    },
  };
}

interface UseMockInvoiceDetailReturn {
  invoice: Invoice | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook: Fetch single invoice detail
 *
 * Usage:
 * const { invoice, loading } = useMockInvoiceDetail("20260111001");
 */
export function useMockInvoiceDetail(
  invoiceId?: string,
): UseMockInvoiceDetailReturn {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(!!invoiceId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) {
      setInvoice(null);
      setLoading(false);
      return;
    }

    const loadDetail = async () => {
      try {
        setLoading(true);
        setError(null);

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Generate a mock invoice with the given ID
        const mockInvoice = generateMockInvoices(1)[0];
        mockInvoice.id = invoiceId;
        setInvoice(mockInvoice);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load invoice details",
        );
      } finally {
        setLoading(false);
      }
    };

    loadDetail();
  }, [invoiceId]);

  return {
    invoice,
    loading,
    error,
  };
}

interface UseMockCustomerInvoicesReturn {
  invoices: Invoice[];
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    invoiceCount: number;
  };
  loading: boolean;
  error: string | null;
}

/**
 * Hook: Fetch invoices for a specific customer
 *
 * Usage:
 * const { invoices, summary, loading } = useMockCustomerInvoices("customer-123");
 */
export function useMockCustomerInvoices(
  customerId: string,
): UseMockCustomerInvoicesReturn {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCustomerInvoices = async () => {
      try {
        setLoading(true);
        setError(null);

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 400));

        // Generate invoices for this customer
        const mockInvoices = generateMockInvoices(8);
        const customerInvoices = mockInvoices.map((inv) => ({
          ...inv,
          userId: customerId,
        }));

        setInvoices(customerInvoices);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load customer invoices",
        );
      } finally {
        setLoading(false);
      }
    };

    loadCustomerInvoices();
  }, [customerId]);

  // Calculate summary
  const summary = {
    totalInvoiced: invoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
    totalPaid: invoices
      .filter((inv) => inv.status === InvoiceStatus.PAID)
      .reduce((sum, inv) => sum + inv.totalAmount, 0),
    totalOutstanding: invoices
      .filter((inv) =>
        [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE].includes(inv.status),
      )
      .reduce((sum, inv) => sum + inv.totalAmount, 0),
    invoiceCount: invoices.length,
  };

  return {
    invoices,
    summary,
    loading,
    error,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build dashboard response from invoices and recurring invoices
 */
function buildDashboardResponse(
  invoices: Invoice[],
  recurringInvoices: RecurringInvoice[],
): DashboardResponse {
  const unpaid = invoices.filter(
    (inv) =>
      inv.status !== InvoiceStatus.PAID &&
      inv.status !== InvoiceStatus.CANCELLED,
  );
  const overdue = unpaid.filter((inv) =>
    isInvoiceOverdue(inv.dueDate, inv.status),
  );

  const upcomingInvoices = unpaid.slice(0, 5).map((inv) => ({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.userId,
    customerName: `Customer ${inv.userId.slice(0, 8)}`,
    amount: inv.totalAmount,
    dueDate: inv.dueDate.toISOString(),
    daysUntilDue: calculateDaysUntilDue(inv.dueDate),
  }));

  const recentInvoices = invoices
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 5)
    .map((inv) => ({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.userId,
      customerName: `Customer ${inv.userId.slice(0, 8)}`,
      amount: inv.totalAmount,
      issuedDate: (inv.issuedDate || inv.invoiceGeneratedDate).toISOString(),
      status: inv.status,
    }));

  return {
    totalInvoices: invoices.length,
    unpaidInvoices: unpaid.length,
    overdueInvoices: overdue.length,
    totalOutstanding: unpaid.reduce((sum, inv) => sum + inv.totalAmount, 0),
    upcomingInvoices,
    recentInvoices,
    recurringInvoices: {
      total: recurringInvoices.length,
      active: recurringInvoices.filter((ri) => ri.isActive).length,
      inactive: recurringInvoices.filter((ri) => !ri.isActive).length,
    },
  };
}
