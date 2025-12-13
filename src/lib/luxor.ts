/**
 * src/lib/luxor.ts
 * Luxor Mining API V2 Client
 *
 * A TypeScript client for interacting with the Luxor Mining Pool API V2.
 * This client handles:
 * - Authentication with Bearer tokens
 * - Request/response formatting
 * - Error handling and retries
 * - Type safety with TypeScript interfaces
 *
 * Base URL: https://app.luxor.tech/api/v2
 *
 * Usage:
 * ```typescript
 * const client = createLuxorClient('user-identifier');
 * const workspace = await client.getWorkspace();
 * const subaccounts = await client.listSubaccounts();
 * ```
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from "axios";

// ============================================================================
// CONSTANTS
// ============================================================================

const LUXOR_BASE_URL = "https://app.luxor.tech/api/v2";
const LUXOR_API_KEY = process.env.LUXOR_API_KEY;

if (!LUXOR_API_KEY) {
  console.warn("⚠️  LUXOR_API_KEY is not set. Luxor API requests will fail.");
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class LuxorError extends Error {
  statusCode: number;
  errorDetails?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    errorDetails?: Record<string, unknown>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorDetails = errorDetails;
  }
}

// ============================================================================
// INTERFACE: Workspace & Sites
// ============================================================================

export interface WorkspaceSite {
  id: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
  products: string[];
  sites: WorkspaceSite[];
}

export interface SiteEnergy {
  base_load_kw: number;
  max_load_kw: number;
  min_load_kw: number;
  settlement_point_id: string;
  settlement_point_name: string;
  power_market: string;
}

export interface SitePoolSubaccount {
  id: number;
  name: string;
}

export interface SitePool {
  subaccounts: SitePoolSubaccount[];
}

export interface Site {
  id: string;
  name: string;
  country: string;
  energy: SiteEnergy;
  pool: SitePool;
}

export interface SitesResponse {
  sites: Site[];
}

// ============================================================================
// INTERFACE: Subaccounts
// ============================================================================

export interface SubaccountSite {
  id: string;
  name: string;
}

export interface Subaccount {
  id: number;
  name: string;
  site: SubaccountSite;
  created_at: string;
  url: string;
}

export interface SubaccountsResponse {
  subaccounts: Subaccount[];
  pagination: Pagination;
}

export interface CreateSubaccountRequest {
  name: string;
  site_id: string;
}

// ============================================================================
// INTERFACE: Payment Settings
// ============================================================================

export interface PaymentAddress {
  address_id: number;
  address_name: string;
  external_address: string;
  revenue_allocation: number;
}

export interface PaymentSettingsAddress {
  subaccount: Subaccount;
  balance: number;
  status: string;
  wallet_id: number;
  payment_frequency: string;
  day_of_week: string;
  addresses: PaymentAddress[];
  next_payout_at: string;
  frozen_until: string;
  pool_discount_rate: number;
}

export interface PaymentSettingsListResponse {
  payment_settings: (PaymentSettingsAddress & {
    currency_type: string;
  })[];
  pagination: Pagination;
}

export interface PaymentSettingsSingleResponse {
  currency_type: string;
  subaccount: Subaccount;
  balance: number;
  status: string;
  wallet_id: number;
  payment_frequency: string;
  day_of_week: string;
  addresses: PaymentAddress[];
  next_payout_at: string;
  frozen_until: string;
  pool_discount_rate: number;
}

export interface CreatePaymentSettingsRequest {
  payment_frequency: string;
  day_of_week: string;
  addresses: PaymentAddress[];
}

export interface UpdatePaymentSettingsRequest {
  wallet_id?: number;
  payment_frequency?: string;
  day_of_week?: string;
  addresses?: PaymentAddress[];
}

// ============================================================================
// INTERFACE: Transactions
// ============================================================================

export interface Transaction {
  currency_type: string;
  date_time: string;
  address_name: string;
  subaccount_name: string;
  transaction_category: string;
  currency_amount: number;
  usd_equivalent: number;
  transaction_id: string;
  transaction_type: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  pagination: Pagination;
}

export interface TransactionsParams {
  subaccount_names?: string;
  site_id?: string;
  start_date?: string;
  end_date?: string;
  transaction_type?: string;
  page_number?: number;
  page_size?: number;
}

// ============================================================================
// INTERFACE: Workers & Analytics
// ============================================================================

export interface Worker {
  currency_type: string;
  id: string;
  subaccount_name: string;
  name: string;
  firmware: string;
  hashrate: number;
  efficiency: number;
  stale_shares: number;
  rejected_shares: number;
  last_share_time: string;
  status: string;
}

export interface WorkersResponse {
  currency_type: string;
  subaccounts: Subaccount[];
  total_inactive: number;
  total_active: number;
  workers: Worker[];
  pagination: Pagination;
}

export interface WorkersParams {
  subaccount_names?: string;
  site_id?: string;
  status?: string;
  page_number?: number;
  page_size?: number;
}

// ============================================================================
// INTERFACE: Hashrate & Efficiency
// ============================================================================

export interface HashrateEfficiencyPoint {
  date_time: string;
  hashrate: string;
  efficiency: number;
}

export interface HashrateEfficiencyResponse {
  currency_type: string;
  start_date: string;
  end_date: string;
  tick_size: string;
  subaccounts: Subaccount[];
  hashrate_efficiency: HashrateEfficiencyPoint[];
  pagination: Pagination;
}

export interface HashrateEfficiencyParams {
  subaccount_names?: string;
  site_id?: string;
  start_date?: string;
  end_date?: string;
  tick_size?: string;
  page_number?: number;
  page_size?: number;
}

// ============================================================================
// INTERFACE: Revenue
// ============================================================================

export interface RevenueData {
  date_time: string;
  revenue: {
    currency_type: string;
    revenue_type: string;
    revenue: number;
  };
}

export interface RevenueResponse {
  currency_type: string;
  start_date: string;
  end_date: string;
  subaccounts: Subaccount[];
  revenue: RevenueData[];
}

export interface RevenueParams {
  subaccount_names?: string;
  site_id?: string;
  start_date?: string;
  end_date?: string;
}

// ============================================================================
// INTERFACE: Active Workers
// ============================================================================

export interface ActiveWorkerData {
  date_time: string;
  active_workers: number;
}

export interface ActiveWorkersResponse {
  currency_type: string;
  start_date: string;
  end_date: string;
  tick_size: string;
  subaccounts: Subaccount[];
  active_workers: ActiveWorkerData[];
  pagination: Pagination;
}

export interface ActiveWorkersParams {
  subaccount_names?: string;
  site_id?: string;
  start_date?: string;
  end_date?: string;
  tick_size?: string;
  page_number?: number;
  page_size?: number;
}

// ============================================================================
// INTERFACE: Pool Hashrate
// ============================================================================

export interface PoolHashrateResponse {
  currency_type: string;
  hashrate_5m: string;
  hashrate_1h: string;
  hashrate_24h: string;
}

// ============================================================================
// INTERFACE: Dev Fee
// ============================================================================

export interface DevFeeData {
  datetime: string;
  devfee_hashrate: string;
  devfee_revenue: number;
  subaccount: string;
}

export interface DevFeeResponse {
  start_date: string;
  end_date: string;
  devfee_data: DevFeeData[];
  pagination: Pagination;
}

export interface DevFeeParams {
  subaccount_names?: string;
  site_id?: string;
  start_date?: string;
  end_date?: string;
  page_number?: number;
  page_size?: number;
}

// ============================================================================
// INTERFACE: Pagination
// ============================================================================

export interface Pagination {
  page_number: number;
  page_size: number;
  item_count: number;
  previous_page_url: string | null;
  next_page_url: string | null;
}

// ============================================================================
// INTERFACE: Generic API Response
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// CLASS: LuxorClient
// ============================================================================

export class LuxorClient {
  private client: AxiosInstance;
  private userIdentifier: string;

  constructor(userIdentifier: string = "unknown-user") {
    this.userIdentifier = userIdentifier;

    this.client = axios.create({
      baseURL: LUXOR_BASE_URL,
      headers: {
        Authorization: `Bearer ${LUXOR_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError) => {
        console.error(
          `[LuxorClient] Error in request to ${error.config?.url}:`,
          error.response?.status,
          error.response?.data,
        );
        throw this.handleError(error);
      },
    );
  }

  // ========================================================================
  // WORKSPACE & SITES METHODS
  // ========================================================================

  /**
   * Get workspace information including sites
   * GET /workspace
   */
  async getWorkspace(): Promise<Workspace> {
    try {
      console.log(
        `[LuxorClient] GET /workspace - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<Workspace>("/workspace");
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * List all sites in the workspace
   * GET /workspace/sites
   */
  async listSites(): Promise<Site[]> {
    try {
      console.log(
        `[LuxorClient] GET /workspace/sites - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<SitesResponse>("/workspace/sites");
      return response.data.sites;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a specific site by ID
   * GET /workspace/sites/:siteId
   */
  async getSite(siteId: string): Promise<Site> {
    try {
      console.log(
        `[LuxorClient] GET /workspace/sites/${siteId} - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<Site>(
        `/workspace/sites/${siteId}`,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // SUBACCOUNT METHODS
  // ========================================================================

  /**
   * List all subaccounts, optionally filtered by site
   * GET /pool/subaccounts?site_id=...
   */
  async listSubaccounts(siteId?: string): Promise<Subaccount[]> {
    try {
      const params = new URLSearchParams();
      if (siteId) {
        params.append("site_id", siteId);
      }

      const queryString = params.toString();
      const url = `/pool/subaccounts${queryString ? "?" + queryString : ""}`;

      console.log(`[LuxorClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<SubaccountsResponse>(url);
      return response.data.subaccounts;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a specific subaccount by name
   * GET /pool/subaccounts/:subaccountName
   */
  async getSubaccount(subaccountName: string): Promise<Subaccount> {
    try {
      console.log(
        `[LuxorClient] GET /pool/subaccounts/${subaccountName} - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<Subaccount>(
        `/pool/subaccounts/${subaccountName}`,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new subaccount in a specific site
   * POST /pool/subaccounts
   *
   * @param name - Subaccount name
   * @param siteId - Site UUID where the subaccount will be created
   */
  async createSubaccount(name: string, siteId: string): Promise<Subaccount> {
    try {
      console.log(
        `[LuxorClient] POST /pool/subaccounts - Name: ${name}, Site: ${siteId} - User: ${this.userIdentifier}`,
      );
      const response = await this.client.post<Subaccount>("/pool/subaccounts", {
        name,
        site_id: siteId,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update a subaccount (move to different site)
   * PUT /pool/subaccounts/:subaccountName
   */
  async updateSubaccount(
    subaccountName: string,
    siteId: string,
  ): Promise<Record<string, unknown>> {
    try {
      console.log(
        `[LuxorClient] PUT /pool/subaccounts/${subaccountName} - Site: ${siteId} - User: ${this.userIdentifier}`,
      );
      const response = await this.client.put<Record<string, unknown>>(
        `/pool/subaccounts/${subaccountName}`,
        {
          site_id: siteId,
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a subaccount
   * DELETE /pool/subaccounts/:subaccountName
   */
  async deleteSubaccount(
    subaccountName: string,
  ): Promise<Record<string, unknown>> {
    try {
      console.log(
        `[LuxorClient] DELETE /pool/subaccounts/${subaccountName} - User: ${this.userIdentifier}`,
      );
      const response = await this.client.delete<Record<string, unknown>>(
        `/pool/subaccounts/${subaccountName}`,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // PAYMENT SETTINGS METHODS
  // ========================================================================

  /**
   * Get payment settings for a currency, optionally filtered by subaccount or site
   * GET /pool/payment-settings/:currency
   */
  async getPaymentSettings(
    currency: string,
    params?: {
      subaccount_names?: string;
      site_id?: string;
      page_number?: number;
      page_size?: number;
    },
  ): Promise<PaymentSettingsListResponse> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.subaccount_names) {
        queryParams.append("subaccount_names", params.subaccount_names);
      }
      if (params?.site_id) {
        queryParams.append("site_id", params.site_id);
      }
      if (params?.page_number) {
        queryParams.append("page_number", params.page_number.toString());
      }
      if (params?.page_size) {
        queryParams.append("page_size", params.page_size.toString());
      }

      const url = `/pool/payment-settings/${currency}${queryParams.toString() ? "?" + queryParams.toString() : ""}`;

      console.log(`[LuxorClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<PaymentSettingsListResponse>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get payment settings for a specific subaccount and currency
   * GET /pool/payment-settings/:currency/:subaccountName
   */
  async getSubaccountPaymentSettings(
    currency: string,
    subaccountName: string,
  ): Promise<PaymentSettingsSingleResponse> {
    try {
      console.log(
        `[LuxorClient] GET /pool/payment-settings/${currency}/${subaccountName} - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<PaymentSettingsSingleResponse>(
        `/pool/payment-settings/${currency}/${subaccountName}`,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create payment settings for a subaccount
   * POST /pool/payment-settings/:currency/:subaccountName
   */
  async createPaymentSettings(
    currency: string,
    subaccountName: string,
    settings: CreatePaymentSettingsRequest,
  ): Promise<Record<string, unknown>> {
    try {
      console.log(
        `[LuxorClient] POST /pool/payment-settings/${currency}/${subaccountName} - User: ${this.userIdentifier}`,
      );
      const response = await this.client.post<Record<string, unknown>>(
        `/pool/payment-settings/${currency}/${subaccountName}`,
        settings,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update payment settings for a subaccount
   * PUT /pool/payment-settings/:currency/:subaccountName
   */
  async updatePaymentSettings(
    currency: string,
    subaccountName: string,
    settings: UpdatePaymentSettingsRequest,
  ): Promise<Record<string, unknown>> {
    try {
      console.log(
        `[LuxorClient] PUT /pool/payment-settings/${currency}/${subaccountName} - User: ${this.userIdentifier}`,
      );
      const response = await this.client.put<Record<string, unknown>>(
        `/pool/payment-settings/${currency}/${subaccountName}`,
        settings,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // TRANSACTION METHODS
  // ========================================================================

  /**
   * Get transactions for a currency
   * GET /pool/transactions/:currency
   */
  async getTransactions(
    currency: string,
    params?: TransactionsParams,
  ): Promise<TransactionsResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const url = `/pool/transactions/${currency}${queryParams ? "?" + queryParams : ""}`;

      console.log(`[LuxorClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<TransactionsResponse>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // WORKERS METHODS
  // ========================================================================

  /**
   * Get workers for a currency
   * GET /pool/workers/:currency
   */
  async getWorkers(
    currency: string,
    params?: WorkersParams,
  ): Promise<WorkersResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const url = `/pool/workers/${currency}${queryParams ? "?" + queryParams : ""}`;

      console.log(`[LuxorClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<WorkersResponse>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // HASHRATE & EFFICIENCY METHODS
  // ========================================================================

  /**
   * Get hashrate and efficiency history
   * GET /pool/hashrate-efficiency/:currency
   */
  async getHashrateEfficiency(
    currency: string,
    params?: HashrateEfficiencyParams,
  ): Promise<HashrateEfficiencyResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const url = `/pool/hashrate-efficiency/${currency}${queryParams ? "?" + queryParams : ""}`;

      console.log(`[LuxorClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<HashrateEfficiencyResponse>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get workers hashrate efficiency history for a specific subaccount
   * GET /pool/workers-hashrate-efficiency/:currency/:subaccountName
   */
  async getWorkersHashrateEfficiency(
    currency: string,
    subaccountName: string,
    params?: {
      worker_names?: string;
      tick_size?: string;
      start_date?: string;
      end_date?: string;
      page_number?: number;
      page_size?: number;
    },
  ): Promise<Record<string, unknown>> {
    try {
      const queryParams = this.buildQueryString(params);
      const url = `/pool/workers-hashrate-efficiency/${currency}/${subaccountName}${queryParams ? "?" + queryParams : ""}`;

      console.log(`[LuxorClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<Record<string, unknown>>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // REVENUE METHODS
  // ========================================================================

  /**
   * Get revenue data
   * GET /pool/revenue/:currency
   */
  async getRevenue(
    currency: string,
    params?: RevenueParams,
  ): Promise<RevenueResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const url = `/pool/revenue/${currency}${queryParams ? "?" + queryParams : ""}`;

      console.log(`[LuxorClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<RevenueResponse>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // ACTIVE WORKERS METHODS
  // ========================================================================

  /**
   * Get active workers history
   * GET /pool/active-workers/:currency
   */
  async getActiveWorkers(
    currency: string,
    params?: ActiveWorkersParams,
  ): Promise<ActiveWorkersResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const url = `/pool/active-workers/${currency}${queryParams ? "?" + queryParams : ""}`;

      console.log(`[LuxorClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<ActiveWorkersResponse>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // POOL METHODS
  // ========================================================================

  /**
   * Get pool hashrate
   * GET /pool/pool-hashrate/:currency
   */
  async getPoolHashrate(currency: string): Promise<PoolHashrateResponse> {
    try {
      console.log(
        `[LuxorClient] GET /pool/pool-hashrate/${currency} - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<PoolHashrateResponse>(
        `/pool/pool-hashrate/${currency}`,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // DEV FEE METHODS
  // ========================================================================

  /**
   * Get dev fee data
   * GET /pool/dev-fee
   */
  async getDevFee(params?: DevFeeParams): Promise<DevFeeResponse> {
    try {
      const queryParams = this.buildQueryString(params);
      const url = `/pool/dev-fee${queryParams ? "?" + queryParams : ""}`;

      console.log(`[LuxorClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<DevFeeResponse>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // GENERIC REQUEST METHOD
  // ========================================================================

  /**
   * Generic request method for any endpoint
   * Useful for testing or accessing endpoints not yet implemented
   *
   * @param path - API endpoint path (without base URL)
   * @param params - Query parameters
   * @param method - HTTP method (default: GET)
   * @param body - Request body for POST/PUT/PATCH
   */
  async request<T = Record<string, unknown>>(
    path: string,
    params?: Record<string, unknown>,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
    body?: Record<string, unknown>,
  ): Promise<T> {
    try {
      const queryString = params
        ? new URLSearchParams(
            Object.entries(params).reduce(
              (acc: Record<string, string>, [key, value]) => {
                if (value !== undefined && value !== null) {
                  acc[key] = String(value);
                }
                return acc;
              },
              {},
            ),
          ).toString()
        : "";

      const url = queryString ? `${path}?${queryString}` : path;

      console.log(
        `[LuxorClient] ${method} ${url} - User: ${this.userIdentifier}`,
      );

      const config = {
        method: method.toLowerCase(),
        url,
        data: body,
      };

      const response = await this.client.request<T>(config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Build URL query string from parameters object
   */
  private buildQueryString(params?: Record<string, unknown> | unknown): string {
    if (!params) return "";

    const entries = Object.entries(params as Record<string, unknown>)
      .filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      )
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);

    return entries.length > 0 ? entries.join("&") : "";
  }

  /**
   * Handle axios errors and convert them to LuxorError
   */
  private handleError(error: AxiosError): LuxorError {
    const status = error.response?.status || 500;
    const data = error.response?.data as Record<string, unknown> | undefined;

    let message = `Luxor API Error: ${error.message}`;

    if (status === 404) {
      message = "Endpoint not found. Check the API path and parameters.";
    } else if (status === 403) {
      message = "Access forbidden. Check your API key permissions.";
    } else if (status === 400) {
      message = `Bad request: ${data?.message || "Invalid parameters"}`;
    } else if (status === 401) {
      message = "Unauthorized. Check your API key.";
    } else if (status === 429) {
      message = "Rate limited. Please try again later.";
    } else if (status === 500) {
      message = "Server error. The Luxor API is experiencing issues.";
    }

    return new LuxorError(message, status, data);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createLuxorClient(
  userIdentifier: string = "unknown-user",
): LuxorClient {
  if (!LUXOR_API_KEY) {
    throw new Error(
      "LUXOR_API_KEY environment variable is not set. Cannot initialize Luxor client.",
    );
  }

  return new LuxorClient(userIdentifier);
}

// ============================================================================
// EXPORT
// ============================================================================

export default LuxorClient;
