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

export interface PoolStats {
  pool_stats: {
    btc: {
      estimated_rewards: number;
      last_block_found: string;
      last_block_found_difficulty: string;
      last_difficulties: Record<string, unknown>;
      last_pay_time: string;
      pay_interval: number;
      pool_difficulty: string;
      pool_hashrate: string;
      pool_name: string;
      total_hash_power: string;
    };
  };
}

// ============================================================================
// INTERFACE: User Profile
// ============================================================================

export interface UserProfile {
  user: {
    username: string;
    email: string;
    verified: boolean;
    notifications_enabled: boolean; 
    notification_email: string;
  };
  summary: {
    hashrate_5min: string;
    hashrate_1h: string;
    hashrate_1d: string;
    hashrate_7d: string;
    difficulty: string;
    workers: number;
    active_workers: number;
    disabled_workers: number;
    total_reward_1min: number;
    total_reward_1h: number;
    total_reward_1d: number;
    total_reward_1w: number;
    total_reward_all_time: number;
    estimated_reward_1d: number;
  };
}

// ============================================================================
// INTERFACE: Daily Rewards
// ============================================================================

export interface RewardData {
  date: string;
  amount: number;
  hashrate: string;
}

export interface DailyRewards {
  rewards: RewardData[];
}

// ============================================================================
// INTERFACE: Daily Hashrate
// ============================================================================

export interface HashrateData {
  time: string;
  hashrate: string;
}

export interface DailyHashrate {
  hashrate: HashrateData[];
  summary: {
    average_hashrate: string;
    minimum_hashrate: string;
    maximum_hashrate: string;
  };
}

// ============================================================================
// INTERFACE: Block Rewards
// ============================================================================

export interface BlockRewardData {
  date: string;
  blocks: number;
  amount: number;
}

export interface BlockRewards {
  rewards: BlockRewardData[];
}

// ============================================================================
// INTERFACE: Worker
// ============================================================================

export interface Worker {
  id: string;
  name: string;
  difficulty: string;
  hashrate_5min: string;
  hashrate_1h: string;
  hashrate_1d: string;
  hashrate_7d: string;
  total_reward_1min: number;
  total_reward_1h: number;
  total_reward_1d: number;
  total_reward_all_time: number;
  accepted_shares: number;
  rejected_shares: number;
  stale_shares: number;
  invalid_shares: number;
  hardware: string;
  last_share_time: string;
  status: "active" | "idle" | "offline";
}

export interface Workers {
  workers: Worker[];
}

// ============================================================================
// INTERFACE: Payouts
// ============================================================================

export interface PayoutData {
  date: string;
  amount: number;
  status: "confirmed" | "pending" | "failed";
  transaction_id: string;
}

export interface Payouts {
  payouts: PayoutData[];
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
   * GET /accounts/rewards/json/btc?from=<timestamp>&to=<timestamp>
   *
   * Returns: Array of daily reward data with hashrate
   * Parameters: from/to (Unix timestamps in seconds)
   * Scope: Single user
   */
  async getDailyRewards(params?: {
    from?: number; // Unix timestamp in seconds
    to?: number; // Unix timestamp in seconds
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

      console.log(
        `[BraiinsClient] GET ${url} - User: ${this.userIdentifier}`,
      );
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
    from?: number; // Unix timestamp in seconds
    to?: number; // Unix timestamp in seconds
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

      console.log(
        `[BraiinsClient] GET ${url} - User: ${this.userIdentifier}`,
      );
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
   * GET /accounts/block_rewards/json/btc?from=<timestamp>&to=<timestamp>
   *
   * Returns: Array of block rewards by date
   * Parameters: from/to (Unix timestamps in seconds)
   * Scope: Single user
   */
  async getBlockRewards(params?: {
    from?: number; // Unix timestamp in seconds
    to?: number; // Unix timestamp in seconds
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

      console.log(
        `[BraiinsClient] GET ${url} - User: ${this.userIdentifier}`,
      );
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
   */
  async getWorkers(): Promise<Workers> {
    try {
      console.log(
        `[BraiinsClient] GET /accounts/workers/json/btc - User: ${this.userIdentifier}`,
      );
      const response = await this.client.get<Workers>(
        "/accounts/workers/json/btc",
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // ========================================================================
  // PAYOUTS
  // ========================================================================

  /**
   * Get payouts for a date range
   * GET /accounts/payouts/json/btc?from=<timestamp>&to=<timestamp>
   *
   * Returns: Array of payout records
   * Parameters: from/to (Unix timestamps in seconds)
   * Scope: Single user
   */
  async getPayouts(params?: {
    from?: number; // Unix timestamp in seconds
    to?: number; // Unix timestamp in seconds
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

      console.log(
        `[BraiinsClient] GET ${url} - User: ${this.userIdentifier}`,
      );
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
    const errorData = error.response?.data as Record<string, unknown> | undefined;

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
