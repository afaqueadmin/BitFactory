/**
 * src/lib/luxor.ts
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
   * @param method - HTTP method (GET, POST, PUT, DELETE)
   * @param body - Optional request body (for POST/PUT)
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
    method?: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    try {
      // Build the complete URL with query parameters
      const url = this.buildUrl(path, params);
      const httpMethod = method || "GET";

      console.log(`[Luxor] ${httpMethod} Request:`, {
        path,
        url,
        method: httpMethod,
        body,
      });

      // Build headers - only include Content-Type if there's a body
      const headers: Record<string, string> = {
        Authorization: this.apiKey,
      };

      if (body) {
        headers["Content-Type"] = "application/json";
      }

      // Make the request with Authorization header
      const response = await fetch(url, {
        method: httpMethod,
        headers,
        ...(body && { body: JSON.stringify(body) }),
      });

      // Parse response body
      const data = await response.json();

      console.log(`[Luxor] ${httpMethod} Response:`, {
        status: response.status,
        ok: response.ok,
        data,
      });

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

  /**
   * Create a new group in the workspace
   *
   * @param groupName - Name of the group to create
   * @returns Created group response with full details
   * @throws LuxorError on API errors
   *
   * @example
   * const group = await client.createGroup("My Mining Group");
   */
  async createGroup(groupName: string): Promise<CreateGroupResponse> {
    console.log(`[Luxor] Creating group: ${groupName}`);
    return this.request<CreateGroupResponse>(
      "/workspace/groups",
      undefined,
      "POST",
      { name: groupName },
    );
  }

  /**
   * Update an existing group (rename)
   *
   * @param groupId - UUID of the group to update
   * @param groupName - New name for the group
   * @returns Updated group response
   * @throws LuxorError on API errors
   *
   * @example
   * const updated = await client.updateGroup("497f6eca-6276-4993-bfeb-53cbbbba6f08", "New Name");
   */
  async updateGroup(
    groupId: string,
    groupName: string,
  ): Promise<UpdateGroupResponse> {
    console.log(`[Luxor] Updating group ${groupId} to: ${groupName}`);
    // Try PATCH first (more common for partial updates), fallback to POST if needed
    return this.request<UpdateGroupResponse>(
      `/workspace/groups/${groupId}`,
      undefined,
      "PATCH",
      { name: groupName },
    );
  }

  /**
   * Delete a group from the workspace
   *
   * @param groupId - UUID of the group to delete
   * @returns Delete action response (may require approval)
   * @throws LuxorError on API errors
   *
   * @example
   * const action = await client.deleteGroup("497f6eca-6276-4993-bfeb-53cbbbba6f08");
   */
  async deleteGroup(groupId: string): Promise<DeleteGroupResponse> {
    console.log(`[Luxor] Deleting group: ${groupId}`);
    return this.request<DeleteGroupResponse>(
      `/workspace/groups/${groupId}`,
      undefined,
      "DELETE",
    );
  }

  /**
   * Get details of a specific group
   *
   * @param groupId - UUID of the group to retrieve
   * @returns Group details with members and subaccounts
   * @throws LuxorError on API errors
   *
   * @example
   * const group = await client.getGroup("497f6eca-6276-4993-bfeb-53cbbbba6f08");
   */
  async getGroup(groupId: string): Promise<GetGroupResponse> {
    console.log(`[Luxor] Getting group: ${groupId}`);
    return this.request<GetGroupResponse>(
      `/workspace/groups/${groupId}`,
      undefined,
      "GET",
    );
  }

  /**
   * Get a specific subaccount in a group
   *
   * @param groupId - UUID of the group
   * @param subaccountName - Name of the subaccount to retrieve
   * @returns Subaccount details
   * @throws LuxorError on API errors
   *
   * @example
   * const subaccount = await client.getSubaccount("497f6eca-6276-4993-bfeb-53cbbbba6f08", "subaccount_1");
   */
  async getSubaccount(
    groupId: string,
    subaccountName: string,
  ): Promise<GetSubaccountResponse> {
    console.log(
      `[Luxor] Getting subaccount: ${subaccountName} in group: ${groupId}`,
    );
    return this.request<GetSubaccountResponse>(
      `/pool/groups/${groupId}/subaccounts/${subaccountName}`,
      undefined,
      "GET",
    );
  }

  /**
   * List all subaccounts in a group
   *
   * @param groupId - UUID of the group
   * @returns Array of subaccounts in the group
   * @throws LuxorError on API errors
   *
   * @example
   * const subaccounts = await client.listSubaccounts("497f6eca-6276-4993-bfeb-53cbbbba6f08");
   */
  async listSubaccounts(groupId: string): Promise<ListSubaccountsResponse> {
    console.log(`[Luxor] Listing subaccounts for group: ${groupId}`);
    return this.request<ListSubaccountsResponse>(
      `/pool/groups/${groupId}/subaccounts`,
      undefined,
      "GET",
    );
  }

  /**
   * Add a subaccount to a group
   *
   * Creates a new subaccount if it doesn't exist, or adds an existing subaccount to the group.
   *
   * @param groupId - UUID of the group
   * @param subaccountName - Name of the subaccount to add
   * @returns Added subaccount details
   * @throws LuxorError on API errors
   *
   * @example
   * const subaccount = await client.addSubaccount("497f6eca-6276-4993-bfeb-53cbbbba6f08", "subaccount_1");
   */
  async addSubaccount(
    groupId: string,
    subaccountName: string,
  ): Promise<AddSubaccountResponse> {
    console.log(
      `[Luxor] Adding subaccount: ${subaccountName} to group: ${groupId}`,
    );
    return this.request<AddSubaccountResponse>(
      `/pool/groups/${groupId}/subaccounts`,
      undefined,
      "POST",
      { name: subaccountName },
    );
  }

  /**
   * Remove a subaccount from a group
   *
   * If the subaccount only belongs to this group, it will be deleted from the workspace entirely.
   *
   * @param groupId - UUID of the group
   * @param subaccountName - Name of the subaccount to remove
   * @returns Action response (may require approval)
   * @throws LuxorError on API errors
   *
   * @example
   * const action = await client.removeSubaccount("497f6eca-6276-4993-bfeb-53cbbbba6f08", "subaccount_1");
   */
  async removeSubaccount(
    groupId: string,
    subaccountName: string,
  ): Promise<RemoveSubaccountResponse> {
    console.log(
      `[Luxor] Removing subaccount: ${subaccountName} from group: ${groupId}`,
    );
    return this.request<RemoveSubaccountResponse>(
      `/pool/groups/${groupId}/subaccounts/${subaccountName}`,
      undefined,
      "DELETE",
    );
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
// Workspace Group APIs - Types
// ============================================================================

/**
 * User information in a group
 */
export interface GroupUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

/**
 * Group member information
 */
export interface GroupMember {
  id: string;
  user: GroupUser;
  /**
   * Status of the user in the group
   */
  status: "UNSPECIFIED" | "ACTIVE" | "PENDING";
  /**
   * Role of the user in the group
   */
  role: "STANDARD" | "ADMIN" | "OWNER";
}

/**
 * Subaccount information in a group
 */
export interface GroupSubaccount {
  id: number;
  /**
   * A subaccount name for which to retrieve summary information
   */
  name: string;
  created_at: string;
  url: string;
}

/**
 * Create Group Request
 *
 * Request body for creating a new group
 *
 * Endpoint: POST /workspace/groups
 */
export interface CreateGroupRequest {
  /**
   * Name of the group to create
   */
  name: string;
}

/**
 * Create Group Response
 *
 * Response from creating a new group
 *
 * Endpoint: POST /workspace/groups
 */
export interface CreateGroupResponse {
  /**
   * Unique identifier for the group
   */
  id: string;
  /**
   * Name of the group
   */
  name: string;
  /**
   * Type of group
   */
  type: "UNSPECIFIED" | "POOL" | "DERIVATIVES" | "HARDWARE";
  /**
   * URL path to the group
   */
  url: string;
  /**
   * Members in the group
   */
  members: GroupMember[];
  /**
   * Subaccounts in the group
   */
  subaccounts: GroupSubaccount[];
}

/**
 * Update Group Request
 *
 * Request body for updating a group (rename)
 *
 * Endpoint: PUT /workspace/groups/{groupId}
 */
export interface UpdateGroupRequest {
  /**
   * New name for the group
   */
  name: string;
}

/**
 * Update Group Response
 *
 * Response from updating a group
 *
 * Endpoint: PUT /workspace/groups/{groupId}
 */
export interface UpdateGroupResponse {
  /**
   * Unique identifier for the group
   */
  id: string;
  /**
   * Name of the group (updated)
   */
  name: string;
  /**
   * Type of group
   */
  type: "UNSPECIFIED" | "POOL" | "DERIVATIVES" | "HARDWARE";
  /**
   * URL path to the group
   */
  url: string;
  /**
   * Members in the group
   */
  members: GroupMember[];
  /**
   * Subaccounts in the group
   */
  subaccounts: GroupSubaccount[];
}

/**
 * Workspace Action - Generic action response for operations requiring approval
 */
export interface WorkspaceAction {
  id: string;
  /**
   * Type of action created
   */
  actionName:
    | "UPDATE_MEMBER_ROLE"
    | "INVITE_MEMBER"
    | "DISABLE_ADMIN_APPROVAL_FLOW"
    | "UPDATE_WORKSPACE"
    | "UPDATE_WORKSPACE_PRODUCT"
    | "REMOVE_STANDARD_MEMBER"
    | "REMOVE_ADMIN_MEMBER"
    | "UPDATE_PAYMENT_SETTINGS"
    | "ADD_PAYMENT_SETTINGS"
    | "ADD_MEMBER_TO_WORKSPACE_PRODUCT"
    | "CREATE_API_KEY"
    | "CREATE_WATCHER_LINK"
    | "ADD_REFERRAL_CODE"
    | "DELETE_REFERRAL_CODE"
    | "DELETE_PRODUCT_GROUP"
    | "CREATE_SUBACCOUNT"
    | "REMOVE_SUBACCOUNT_FROM_GROUP"
    | "ADD_EXISTING_SUBACCOUNT_TO_GROUP"
    | "MOVE_SUBACCOUNT_TO_GROUP"
    | "ADD_SUBACCOUNT_ON_MULTIPLE_PRODUCTS"
    | "REMOVE_SUBACCOUNT_ON_MULTIPLE_PRODUCTS"
    | "LEAVE_WORKSPACE"
    | "DERIVATIVES_CREATE_ORDERS"
    | "DERIVATIVES_UPDATE_ORDER"
    | "DERIVATIVES_DELETE_ORDERS"
    | "DERIVATIVES_CANCEL_ORDERS"
    | "ENABLE_ADMIN_APPROVAL_FLOW";
  /**
   * Status of the action created
   */
  status:
    | "PENDING"
    | "PROCESSING"
    | "AWAITING_APPROVAL"
    | "AWAITING_INVITATION_ACCEPTANCE"
    | "COMPLETED"
    | "EXPIRED"
    | "FAILED"
    | "CANCELLED";
  initiatedAt: string;
  initiatedBy: {
    id: string;
    displayName: string;
    type: "API_KEY" | "USER";
  } | null;
  requiresApproval: boolean;
  canceledBy: {
    id: string;
    displayName: string;
    type: "API_KEY" | "USER";
  } | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  approvedBy: {
    id: string;
    displayName: string;
    type: "API_KEY" | "USER";
  }[];
  rejectedBy: {
    id: string;
    displayName: string;
    type: "API_KEY" | "USER";
  }[];
  /**
   * Action URL path where the action can be viewed, approved or rejected
   */
  url: string;
  metadata?: unknown;
}

/**
 * Delete Group Response
 *
 * Response from deleting a group (may require approval)
 *
 * Endpoint: DELETE /workspace/groups/{groupId}
 *
 * Extends WorkspaceAction to include action details
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DeleteGroupResponse extends WorkspaceAction {}

/**
 * Get Group Response
 *
 * Response from retrieving a specific group
 *
 * Endpoint: GET /workspace/groups/{groupId}
 */
export interface GetGroupResponse {
  /**
   * Unique identifier for the group
   */
  id: string;
  /**
   * Name of the group
   */
  name: string;
  /**
   * Type of group
   */
  type: "UNSPECIFIED" | "POOL" | "DERIVATIVES" | "HARDWARE";
  /**
   * URL path to the group
   */
  url: string;
  /**
   * Members in the group
   */
  members: GroupMember[];
  /**
   * Subaccounts in the group
   */
  subaccounts: GroupSubaccount[];
}

// ============================================================================
// Workspace Subaccount APIs - Types
// ============================================================================

/**
 * Get Subaccount Response
 *
 * Response from retrieving a specific subaccount in a group
 *
 * Endpoint: GET /pool/groups/{groupId}/subaccounts/{subaccountName}
 */
export interface GetSubaccountResponse {
  /**
   * Numeric ID of the subaccount
   */
  id: number;
  /**
   * Name of the subaccount
   */
  name: string;
  /**
   * Creation timestamp
   */
  created_at: string;
  /**
   * URL path to the subaccount
   */
  url: string;
}

/**
 * List Subaccounts Response
 *
 * Response from retrieving all subaccounts in a group
 *
 * Endpoint: GET /pool/groups/{groupId}/subaccounts
 */
export interface ListSubaccountsResponse {
  /**
   * Array of subaccounts in the group
   */
  subaccounts: GetSubaccountResponse[];
}

/**
 * Add Subaccount Response
 *
 * Response from adding a subaccount to a group.
 * Creates a new subaccount if it doesn't exist, or adds an existing one to the group.
 *
 * Endpoint: POST /pool/groups/{groupId}/subaccounts
 */
export interface AddSubaccountResponse {
  /**
   * Numeric ID of the subaccount
   */
  id: number;
  /**
   * Name of the subaccount
   */
  name: string;
  /**
   * Creation timestamp
   */
  created_at: string;
  /**
   * URL path to the subaccount
   */
  url: string;
}

/**
 * Remove Subaccount Response
 *
 * Response from removing a subaccount from a group.
 * If the subaccount only belongs to one group, it will be removed from the workspace and deleted.
 * This returns a WorkspaceAction that may require approval.
 *
 * Endpoint: DELETE /pool/groups/{groupId}/subaccounts/{subaccountName}
 *
 * Extends WorkspaceAction to include action details
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RemoveSubaccountResponse extends WorkspaceAction {}

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
 * - Workspace Groups: /workspace/groups (group management) - no currency needed
 * - Workspace Subaccounts: /pool/groups/{groupId}/subaccounts - no currency needed
 * - Add more categories as needed
 */
export const LUXOR_ENDPOINTS = {
  "active-workers": "/pool/active-workers",
  "hashrate-efficiency": "/pool/hashrate-efficiency",
  workspace: "/workspace",
  workers: "/pool/workers",
  "group-create": "/workspace/groups",
  "group-get": "/workspace/groups",
  "group-update": "/workspace/groups",
  "group-delete": "/workspace/groups",
  subaccount: "/pool/groups",
  // ⬇️ ADD NEW ENDPOINTS HERE ⬇️
  // Example: 'earnings': '/earnings',
  // Example: 'pool-stats': '/pool/stats',
} as const;

export type LuxorEndpointKey = keyof typeof LUXOR_ENDPOINTS;
