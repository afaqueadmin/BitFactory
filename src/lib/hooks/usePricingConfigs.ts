import { useState, useEffect } from "react";
import { CustomerPricingConfig } from "@/generated/prisma";

export interface PricingConfigWithDetails extends CustomerPricingConfig {
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

export function usePricingConfigs(
  page: number = 1,
  limit: number = 10,
  customerId?: string,
) {
  const [pricingConfigs, setPricingConfigs] = useState<
    PricingConfigWithDetails[]
  >([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPricingConfigs = async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.append("page", page.toString());
        params.append("limit", limit.toString());
        if (customerId) params.append("customerId", customerId);

        const res = await fetch(`/api/accounting/pricing-configs?${params}`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch pricing configs");
        }

        const data = await res.json();
        setPricingConfigs(data.pricingConfigs);
        setTotal(data.pagination.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchPricingConfigs();
  }, [page, limit, customerId]);

  return { pricingConfigs, total, loading, error };
}

export function usePricingConfig(id: string) {
  const [pricingConfig, setPricingConfig] =
    useState<PricingConfigWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchPricingConfig = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/accounting/pricing-configs/${id}`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch pricing config");
        }

        const data = await res.json();
        setPricingConfig(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchPricingConfig();
  }, [id]);

  const updatePricingConfig = async (
    updates: Partial<PricingConfigWithDetails>,
  ) => {
    try {
      const res = await fetch(`/api/accounting/pricing-configs/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        throw new Error("Failed to update pricing config");
      }

      const data = await res.json();
      setPricingConfig(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      throw err;
    }
  };

  return { pricingConfig, loading, error, updatePricingConfig };
}

export function useCreatePricingConfig() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (data: {
    customerId: string;
    defaultUnitPrice: number;
    effectiveFrom: string;
    effectiveTo?: string;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/accounting/pricing-configs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create pricing config");
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
