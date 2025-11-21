/**
 * Luxor Mining API Client
 *
 * A secure, server-side only client for interacting with the Luxor mining API.
 * This module handles:
 * - API key management (server-side only, never exposed to client)
 * - URL construction with dynamic query parameters
 * - Error handling with structured error types
 * - TypeScript generics for type-safe responses
 *
 * Base URL: https://app.luxor.tech/api/v1
 *
 * Usage:
 * ```typescript
 * const client = new LuxorClient(subaccountName, apiKey);
 * const workers = await client.request<ActiveWorkersResponse>(
 *   '/pool/active-workers/BTC',
 *   { start_date: '2025-01-01', end_date: '2025-01-31' }
 * );
 * ```
 */

/**
 * Structured error type for Luxor API failures
 */
export class LuxorError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LuxorError";
  }
}

/**
 * Query parameters that can be passed to Luxor endpoints
 * These are optional and only included in the URL if provided
 */
export interface LuxorQueryParams {
  [key: string]: string | number | undefined | null;
}

/**
 * LuxorClient: Main API client for interacting with Luxor mining API
 *
 * This client must only be used server-side. The API key is stored
 * in the constructor and never exposed to the client.
 */
export class LuxorClient {
  private readonly baseUrl = "https://app.luxor.tech/api/v1";
  private readonly apiKey: string;
  private readonly subaccountName: string;

  /**
   * Initialize the Luxor API client
   *
   * @param subaccountName - The user's Luxor subaccount name (extracted from JWT)
   * @param apiKey - The Luxor API key (from environment variable)
   * @throws Error if apiKey is not provided
   */
  constructor(subaccountName: string, apiKey: string) {
    if (!apiKey) {
      throw new Error(
        "Luxor API key is required. Set LUXOR_API_KEY in environment.",
      );
    }
    if (!subaccountName) {
      throw new Error("Subaccount name is required.");
    }

    this.subaccountName = subaccountName;
    this.apiKey = apiKey;
  }

  /**
   * Build a URL with dynamic query parameters
   *
   * This method constructs a query string from provided parameters,
   * only including parameters that have defined (truthy) values.
   *
   * @param path - The API endpoint path (e.g., '/pool/active-workers/BTC')
   * @param params - Optional query parameters
   * @returns Complete URL ready for fetch
   *
   * @example
   * buildUrl('/pool/active-workers/BTC', {
   *   start_date: '2025-01-01',
   *   tick_size: '1d',
   *   currency: undefined // will be excluded
   * })
   * // => 'https://app.luxor.tech/api/v1/pool/active-workers/BTC?start_date=2025-01-01&tick_size=1d'
   */
  private buildUrl(path: string, params?: LuxorQueryParams): string {
    const url = new URL(this.baseUrl + path);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        // Only add parameter if it has a defined value
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Make an authenticated request to the Luxor API
   *
   * This method handles:
   * - Building the request URL with query parameters
   * - Adding the Authorization header with the API key
   * - Parsing and validating the response
   * - Throwing structured errors on failure
   *
   * @template T - The expected response type
   * @param path - The API endpoint path
   * @param params - Optional query parameters
   * @returns Parsed response of type T
   * @throws LuxorError on API errors
   * @throws Error on network or parsing errors
   *
   * @example
   * const response = await client.request<ActiveWorkersResponse>(
   *   '/pool/active-workers/BTC',
   *   { start_date: '2025-01-01', end_date: '2025-01-31' }
   * );
   */
  async request<T = Record<string, unknown>>(
    path: string,
    params?: LuxorQueryParams,
  ): Promise<T> {
    try {
      // Build the complete URL with query parameters
      const url = this.buildUrl(path, params);

      console.log(`[Luxor] Fetching: ${path}`);

      // Make the request with Authorization header
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
        },
      });

      // Parse response body
      const data = await response.json();

      // Check if the request was successful
      if (!response.ok) {
        throw new LuxorError(
          response.status,
          data.message || `API returned status ${response.status}`,
          data,
        );
      }

      return data as T;
    } catch (error) {
      // Re-throw if it's already a LuxorError
      if (error instanceof LuxorError) {
        throw error;
      }

      // Wrap other errors
      if (error instanceof Error) {
        throw new LuxorError(500, error.message, { originalError: error });
      }

      throw new LuxorError(500, "Unknown error occurred");
    }
  }

  /**
   * Get the subaccount name
   * Useful for passing to API endpoints that accept subaccount filters
   */
  getSubaccountName(): string {
    return this.subaccountName;
  }
}

/**
 * Factory function to create a LuxorClient with the API key from environment
 *
 * This function should be called server-side only and used to initialize
 * the client with credentials from environment variables.
 *
 * @param subaccountName - The user's Luxor subaccount name
 * @returns LuxorClient instance
 * @throws Error if LUXOR_API_KEY is not set in environment
 *
 * @example
 * const client = createLuxorClient(user.name);
 * const data = await client.request('/pool/active-workers/BTC');
 */
export function createLuxorClient(subaccountName: string): LuxorClient {
  const apiKey = process.env.LUXOR_API_KEY;
  if (!apiKey) {
    throw new Error("LUXOR_API_KEY is not set in environment variables");
  }
  return new LuxorClient(subaccountName, apiKey);
}

// ============================================================================
// TypeScript Interfaces for Luxor API Responses
// ============================================================================

/**
 * Active Workers Response
 *
 * Returns the count of active workers over a specified time period
 * for a given subaccount and mining currency.
 *
 * Endpoint: GET /pool/active-workers/{currency}
 * Query Parameters:
 *   - start_date: ISO date string (e.g., '2025-01-01')
 *   - end_date: ISO date string
 *   - tick_size: Granularity - '5m' (last week), '1h' (last month), '1d'/'1w'/'1M' (full history)
 *   - subaccount_names: Comma-separated subaccount names
 *   - page_number: Pagination
 *   - page_size: Pagination
 */
export interface ActiveWorkersResponse {
  currency_type:
    | "UNSPECIFIED"
    | "BTC"
    | "LTC_DOGE"
    | "SC"
    | "ZEC"
    | "ZEN"
    | "LTC"
    | "DOGE";
  subaccounts: {
    id: number;
    /** A subaccount name for which to retrieve data */
    name: string;
  }[];
  start_date: string;
  end_date: string;
  /** Granularity: 5m (last week), 1h (last month), 1d/1w/1M (full history) */
  tick_size: "5m" | "1h" | "1d" | "1w" | "1M";
  active_workers: {
    date_time: string;
    active_workers: number;
  }[];
  pagination: {
    page_number?: number;
    page_size?: number;
    item_count?: number;
    previous_page_url?: string | null;
    next_page_url?: string | null;
  };
}

/**
 * Hashrate Efficiency Response
 *
 * Returns hashrate and efficiency metrics over a specified time period.
 *
 * Endpoint: GET /pool/hashrate-efficiency
 * Query Parameters:
 *   - start_date: ISO date string
 *   - end_date: ISO date string
 *   - tick_size: Granularity
 *   - currency: Mining currency (BTC, LTC, etc.)
 *   - subaccount_names: Comma-separated subaccount names
 */
export interface HashrateEfficiencyResponse {
  currency_type:
    | "UNSPECIFIED"
    | "BTC"
    | "LTC_DOGE"
    | "SC"
    | "ZEC"
    | "ZEN"
    | "LTC"
    | "DOGE";
  subaccounts: {
    id: number;
    name: string;
  }[];
  start_date: string;
  end_date: string;
  tick_size: "5m" | "1h" | "1d" | "1w" | "1M";
  hashrate_efficiency: {
    date_time: string;
    hashrate: number;
    efficiency: number;
  }[];
  pagination: {
    page_number?: number;
    page_size?: number;
    item_count?: number;
    previous_page_url?: string | null;
    next_page_url?: string | null;
  };
}

/**
 * Workspace Response
 *
 * Returns workspace information and configuration.
 *
 * Endpoint: GET /workspace
 */
export interface WorkspaceResponse {
  id: string;
  name: string;
  [key: string]: unknown; // Additional fields as returned by Luxor
}

/**
 * Workers Response
 *
 * Returns detailed information about workers in a mining pool.
 *
 * Endpoint: GET /pool/workers/{currency}
 * Query Parameters:
 *   - page_number: Pagination (default 1)
 *   - page_size: Items per page (default 10)
 *   - status: Filter by status - ACTIVE, INACTIVE
 *   - subaccount_names: Comma-separated subaccount names
 *   - group_id: Optional group filter
 */
export interface WorkersResponse {
  currency_type:
    | "UNSPECIFIED"
    | "BTC"
    | "LTC_DOGE"
    | "SC"
    | "ZEC"
    | "ZEN"
    | "LTC"
    | "DOGE";
  subaccounts: {
    id: number;
    /** A subaccount name for which to retrieve data */
    name: string;
  }[];
  total_inactive: number;
  total_active: number;
  workers: {
    id: string;
    currency_type:
      | "UNSPECIFIED"
      | "BTC"
      | "LTC_DOGE"
      | "SC"
      | "ZEC"
      | "ZEN"
      | "LTC"
      | "DOGE";
    /** A subaccount name for which to retrieve data */
    subaccount_name: string;
    name: string;
    firmware: string;
    hashrate: number;
    efficiency: number;
    stale_shares: number;
    rejected_shares: number;
    last_share_time: string;
    status: "UNSPECIFIED" | "ACTIVE" | "INACTIVE";
  }[];
  pagination: {
    page_number?: number;
    page_size?: number;
    item_count?: number;
    previous_page_url?: string | null;
    next_page_url?: string | null;
  };
}

/**
 * Generic Luxor API Response wrapper
 *
 * Many Luxor endpoints follow this structure
 */
export interface LuxorApiResponse<T = Record<string, unknown>> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// Endpoint Mapping and Documentation
// ============================================================================

/**
 * Supported Luxor API endpoints
 *
 * This map is used by the proxy route to validate and route requests.
 * To add new endpoints:
 * 1. Add the endpoint key and path here
 * 2. Add the corresponding TypeScript interface above
 * 3. Update the proxy route's endpointMap
 * 4. Update this file's documentation
 *
 * IMPORTANT: Some endpoints require currency as a path parameter
 * (e.g., /pool/active-workers/BTC) - these are marked with requiresCurrency: true
 *
 * Endpoint Categories:
 * - Pool: /pool/* (worker counts, hashrate, efficiency) - most require currency
 * - Workspace: /workspace (account information) - no currency needed
 * - Add more categories as needed
 */
export const LUXOR_ENDPOINTS = {
  "active-workers": "/pool/active-workers",
  "hashrate-efficiency": "/pool/hashrate-efficiency",
  workspace: "/workspace",
  workers: "/pool/workers",
  // ⬇️ ADD NEW ENDPOINTS HERE ⬇️
  // Example: 'earnings': '/earnings',
  // Example: 'pool-stats': '/pool/stats',
} as const;

export type LuxorEndpointKey = keyof typeof LUXOR_ENDPOINTS;
