/// <filename>src/lib/types/wallet.ts</filename>
/**
 * Luxor wallet and payment settings type definitions
 */

export interface PaymentAddress {
  address_id: number;
  address_name: string;
  external_address: string;
  revenue_allocation: number;
}

/**
 * Wallet settings response from Luxor API
 * This matches the SubaccountPaymentSettingsResponse structure
 */
export interface LuxorPaymentSettings {
  currency_type: string;
  subaccount: {
    id: number;
    name: string;
    created_at: string;
    url: string;
  };
  balance: number;
  status: string;
  wallet_id: number;
  payment_frequency: string;
  day_of_week?: string;
  addresses: PaymentAddress[];
  next_payout_at?: string;
  frozen_until?: string;
}

/**
 * Legacy address interface for backward compatibility
 */
export interface LuxorAddress {
  address_id: number;
  address_name: string;
  external_address: string;
  revenue_allocation: number;
}

export interface WalletFetchResponse {
  success: boolean;
  data?: LuxorPaymentSettings;
  error?: string;
  code?: string;
  timestamp: string;
}

export interface WalletErrorResponse {
  success: false;
  error: string;
  code:
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "USER_NOT_FOUND"
    | "NO_LUXOR_CONFIG"
    | "LUXOR_FORBIDDEN"
    | "LUXOR_RATE_LIMIT"
    | "LUXOR_UNAVAILABLE"
    | "LUXOR_ERROR"
    | "NETWORK_TIMEOUT"
    | "UNKNOWN_ERROR";
  timestamp: string;
  retryAfter?: number; // For 429 responses
}
