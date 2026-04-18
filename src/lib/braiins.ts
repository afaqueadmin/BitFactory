/**
 * src/lib/braiins.ts
 * Braiins Mining Pool API Client
 *
 * A TypeScript client for interacting with the Braiins Mining Pool API.
 * This client handles:
 * - Authentication with per-user API tokens (Pool-Auth-Token header)
 * - Request/response formatting
 * - Error handling
 * - Type safety with TypeScript interfaces
 *
 * Base URL: https://pool.braiins.com
 * Authentication: Pool-Auth-Token header (per-user token)
 *
 * Note: Braiins API is flat structure - one token = one user's data
 * No multi-user/subaccount support like Luxor
 *
 * Usage:
 * ```typescript
 * const client = createBraiinsClient('braiins_api_token_xyz', 'user@example.com');
 * const profile = await client.getUserProfile();
 * const workers = await client.getWorkers();
 * ```
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from "axios";

// ============================================================================
// CONSTANTS
// ============================================================================

const BRAIINS_BASE_URL = "https://pool.braiins.com";

// ============================================================================
// ERROR TYPES
// ============================================================================

export class BraiinsError extends Error {
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
// INTERFACE: Pool Stats (Global)
// ============================================================================

export interface PoolStatsData {
  hash_rate_unit: string;
  pool_active_workers: number;
  blocks: Record<string, unknown>;
  fpps_rate: number;
  pool_5m_hash_rate: number;
  pool_60m_hash_rate: number;
  pool_24h_hash_rate: number;
  update_ts: number;
}

export interface PoolStats {
  btc: PoolStatsData;
}

// ============================================================================
// INTERFACE: User Profile
// ============================================================================

export interface UserProfileBTC {
  all_time_reward: string;
  hash_rate_unit: string;
  hash_rate_5m: number;
  hash_rate_60m: number;
  hash_rate_24h: number;
  hash_rate_yesterday: number;
  low_workers: number;
  off_workers: number;
  ok_workers: number;
  dis_workers: number;
  current_balance: string;
  today_reward: string;
  estimated_reward: string;
  shares_5m: number;
  shares_60m: number;
  shares_24h: number;
  shares_yesterday: number;
}

export interface UserProfile {
  username: string;
  btc: UserProfileBTC;
}

// ============================================================================
// INTERFACE: Daily Rewards
// ============================================================================

export interface RewardData {
  date: number; // Unix timestamp
  total_reward: string;
  mining_reward: string;
  bos_plus_reward: string;
  referral_bonus: string;
  referral_reward: string;
  shares: number;
  share_prices: Array<{
    from_ts: number;
    to_ts: number;
    share_price: string;
  }>;
  calculation_date: number;
}

export interface DailyRewardsBTC {
  daily_rewards: RewardData[];
}

export interface DailyRewards {
  btc: DailyRewardsBTC;
}

// ============================================================================
// INTERFACE: Daily Hashrate
// ============================================================================

export interface HashrateData {
  time: string;
  hashrate: string;
}

export interface DailyHashrateBTC {
  hash_rate_unit: string;
  daily_hashrate: Array<{
    date: number;
    hourly_data: Array<{
      timestamp: number;
      hash_rate: string;
    }>;
  }>;
}

export interface DailyHashrate {
  btc: DailyHashrateBTC;
}

// ============================================================================
// INTERFACE: Block Rewards
// ============================================================================

export interface BlockRewardData {
  date: number;
  blocks: number;
  amount: string;
}

export interface BlockRewardsBTC {
  block_rewards: BlockRewardData[];
}

export interface BlockRewards {
  btc: BlockRewardsBTC;
}

// ============================================================================
// INTERFACE: Worker
// ============================================================================

export interface WorkerData {
  state: "ok" | "dis" | "low" | "off";
  last_share: number; // Unix timestamp
  hash_rate_unit: string;
  hash_rate_5m: number;
  hash_rate_60m: number;
  hash_rate_24h: number;
  shares_5m: number;
  shares_60m: number;
  shares_24h: number;
}

export interface WorkersBTC {
  workers: Record<string, WorkerData>; // Object with worker names as keys
}

export interface Workers {
  btc: WorkersBTC;
}

// ============================================================================
// INTERFACE: Payouts
// ============================================================================

/**
 * Represents a single on-chain Bitcoin payout transaction
 * Per Braiins Academy: https://academy.braiins.com/en/braiins-pool/monitoring/
 */
export interface OnchainPayout {
  financial_account_name: string; // e.g., "Bitcoin Account"
  requested_at_ts: number; // Unix timestamp when payout was requested
  resolved_at_ts: number; // Unix timestamp when payout was resolved
  status: "queued" | "confirmed" | "failed"; // Payout status
  amount_sats: number; // Amount in satoshis
  fee_sats: number; // Fee in satoshis
  destination: string; // Bitcoin address or Lightning invoice
  tx_id?: string; // Transaction ID (onchain only)
  invoice?: string; // Lightning invoice (lightning only)
  preimage?: string; // Lightning preimage (lightning only)
  trigger_type?: string; // "triggered" or "manual"
}

/**
 * Represents the complete payout response from Braiins API
 * Returns on-chain and optional lightning payouts
 */
export interface Payouts {
  onchain: OnchainPayout[]; // Array of on-chain payouts
  lightning?: OnchainPayout[]; // Optional array of Lightning payouts
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
// CLASS: BraiinsClient
// ============================================================================

export class BraiinsClient {
  private client: AxiosInstance;
  private apiToken: string;
  private userIdentifier: string;

  constructor(apiToken: string, userIdentifier: string = "unknown-user") {
    if (!apiToken || apiToken.trim() === "") {
      throw new Error("Braiins API token is required and cannot be empty");
    }

    this.apiToken = apiToken;
    this.userIdentifier = userIdentifier;

    this.client = axios.create({
      baseURL: BRAIINS_BASE_URL,
      headers: {
        "Pool-Auth-Token": this.apiToken,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: AxiosError) => {
        console.error(
          `[BraiinsClient] Error in request to ${error.config?.url}:`,
          error.response?.status,
          error.response?.data,
        );
        throw this.handleError(error);
      },
    );
  }

  // ========================================================================
  // POOL STATS (GLOBAL)
  // ========================================================================

  /**
   * Get global pool statistics
   * GET /stats/json/btc
   *
   * No authentication required - public endpoint
   * Returns: Pool-wide statistics (hashrate, difficulty, block info)
   */
  async getPoolStats(): Promise<PoolStats> {
    try {
      console.log(
        `[BraiinsClient] GET /stats/json/btc - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<PoolStats>("/stats/json/btc");
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // USER PROFILE
  // ========================================================================

  /**
   * Get user profile and summary statistics
   * GET /accounts/profile/json/btc
   *
   * Returns: User info, hashrate, worker count, rewards summary
   * Scope: Single user (authenticated via Pool-Auth-Token)
   */
  async getUserProfile(): Promise<UserProfile> {
    try {
      console.log(
        `[BraiinsClient] GET /accounts/profile/json/btc - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<UserProfile>(
        "/accounts/profile/json/btc",
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // DAILY REWARDS
  // ========================================================================

  /**
   * Get daily rewards data for a date range
   * GET /accounts/rewards/json/btc?from=<date>&to=<date>
   *
   * Returns: Array of daily reward data with hashrate
   * Parameters: from/to (ISO format dates YYYY-MM-DD)
   * Scope: Single user
   */
  async getDailyRewards(params?: {
    from?: string; // ISO format date YYYY-MM-DD
    to?: string; // ISO format date YYYY-MM-DD
  }): Promise<DailyRewards> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.from) {
        queryParams.append("from", params.from.toString());
      }
      if (params?.to) {
        queryParams.append("to", params.to.toString());
      }

      const url = `/accounts/rewards/json/btc${queryParams.toString() ? "?" + queryParams.toString() : ""}`;

      console.log(`[BraiinsClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<DailyRewards>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // DAILY HASHRATE
  // ========================================================================

  /**
   * Get daily hashrate data, optionally grouped
   * GET /accounts/hash_rate_daily/json/btc?group=<boolean>
   * OR
   * GET /accounts/group/btc (POST for grouped)
   *
   * Returns: Hourly hashrate points and summary statistics
   * Parameters: group=true aggregates all workers for this user
   * Note: "group" parameter groups THIS user's workers, not multiple users
   * Scope: Single user
   */
  async getDailyHashrate(params?: {
    from?: string; // ISO format date YYYY-MM-DD
    to?: string; // ISO format date YYYY-MM-DD
    group?: boolean; // Aggregate all workers for this user
  }): Promise<DailyHashrate> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.from) {
        queryParams.append("from", params.from.toString());
      }
      if (params?.to) {
        queryParams.append("to", params.to.toString());
      }
      if (params?.group !== undefined) {
        queryParams.append("group", params.group.toString());
      }

      const url = `/accounts/hash_rate_daily/json/btc${queryParams.toString() ? "?" + queryParams.toString() : ""}`;

      console.log(`[BraiinsClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<DailyHashrate>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // BLOCK REWARDS
  // ========================================================================

  /**
   * Get block rewards data for a date range
   * GET /accounts/block_rewards/json/btc?from=<date>&to=<date>
   *
   * Returns: Array of block rewards by date
   * Parameters: from/to (ISO format dates YYYY-MM-DD)
   * Scope: Single user
   */
  async getBlockRewards(params?: {
    from?: string; // ISO format date YYYY-MM-DD
    to?: string; // ISO format date YYYY-MM-DD
  }): Promise<BlockRewards> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.from) {
        queryParams.append("from", params.from.toString());
      }
      if (params?.to) {
        queryParams.append("to", params.to.toString());
      }

      const url = `/accounts/block_rewards/json/btc${queryParams.toString() ? "?" + queryParams.toString() : ""}`;

      console.log(`[BraiinsClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<BlockRewards>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // WORKERS
  // ========================================================================

  /**
   * Get all workers for this user
   * GET /accounts/workers/json/btc
   *
   * Returns: Array of all workers with their statistics
   * Note: Returns ALL workers for authenticated user (no filtering available)
   * Scope: Single user
   *
   * Converts the API's object format to array format for easier consumption
   */
  async getWorkers(): Promise<Array<{ name: string } & WorkerData>> {
    try {
      console.log(
        `[BraiinsClient] GET /accounts/workers/json/btc - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<Workers>(
        "/accounts/workers/json/btc",
      );

      // Convert workers object to array format
      const workersObj = response.data.btc.workers;
      const workersArray = Object.entries(workersObj).map(([name, data]) => ({
        name,
        ...data,
      }));

      return workersArray;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // PAYOUTS
  // ========================================================================

  /**
   * Get payouts for a date range
   * GET /accounts/payouts/json/btc?from=<date>&to=<date>
   *
   * Returns: Array of payout records
   * Parameters: from/to (ISO format dates YYYY-MM-DD)
   * Scope: Single user
   */
  async getPayouts(params?: {
    from?: string; // ISO format date YYYY-MM-DD
    to?: string; // ISO format date YYYY-MM-DD
  }): Promise<Payouts> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.from) {
        queryParams.append("from", params.from.toString());
      }
      if (params?.to) {
        queryParams.append("to", params.to.toString());
      }

      const url = `/accounts/payouts/json/btc${queryParams.toString() ? "?" + queryParams.toString() : ""}`;

      console.log(`[BraiinsClient] GET ${url} - User: ${this.userIdentifier}`);
      const response = await this.client.get<Payouts>(url);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // ERROR HANDLING
  // ========================================================================

  /**
   * Handle Axios errors and convert to BraiinsError
   */
  private handleError(error: AxiosError): BraiinsError {
    const statusCode = error.response?.status || 500;
    const errorData = error.response?.data as
      | Record<string, unknown>
      | undefined;

    let message = `Braiins API Error: ${error.message}`;

    // Try to extract error message from response
    if (errorData) {
      if (typeof errorData === "object") {
        const errMsg = errorData.error || errorData.message;
        if (typeof errMsg === "string") {
          message = errMsg;
        }
      }
    }

    if (statusCode === 401) {
      message = "Braiins Authentication failed: Invalid or expired API token";
    } else if (statusCode === 403) {
      message = "Braiins Access denied: Insufficient permissions";
    } else if (statusCode === 404) {
      message = "Braiins Resource not found";
    } else if (statusCode === 429) {
      message = "Braiins Rate limit exceeded";
    }

    return new BraiinsError(message, statusCode, errorData);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createBraiinsClient(
  apiToken: string,
  userIdentifier: string = "unknown-user",
): BraiinsClient {
  if (!apiToken || apiToken.trim() === "") {
    throw new Error(
      "Braiins API token is required. Cannot initialize Braiins client without a valid token.",
    );
  }

  return new BraiinsClient(apiToken, userIdentifier);
}
