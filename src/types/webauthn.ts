/**
 * WebAuthn Type Definitions for SimpleWebAuthn Library
 * Matches the exact structures used by @simplewebauthn/browser and @simplewebauthn/server
 */

// ============================================================================
// Registration (Passkey Setup) Response from Server
// ============================================================================

/**
 * Options returned by POST /api/auth/webauthn/register/options
 * These are passed directly to startRegistration() from @simplewebauthn/browser
 */
export interface WebAuthnRegistrationOptions {
  publicKey: {
    challenge: string; // base64url encoded challenge
    rp: {
      name: string;
      id: string;
    };
    user: {
      id: string; // base64url encoded userId
      name: string;
      displayName: string;
    };
    pubKeyCredParams: Array<{
      alg: number;
      type: "public-key";
    }>;
    timeout?: number;
    attestation?: "none" | "indirect" | "direct" | "enterprise";
    authenticatorSelection?: {
      authenticatorAttachment?: "platform" | "cross-platform";
      residentKey?: "discouraged" | "preferred" | "required";
      userVerification?: "discouraged" | "preferred" | "required";
    };
    excludeCredentials?: Array<{
      type: "public-key";
      id: string; // base64url
      transports?: ("usb" | "nfc" | "ble" | "internal" | "hybrid")[];
    }>;
    extensions?: Record<string, unknown>;
  };
}

/**
 * Attestation Response from Browser
 * Returned by startRegistration() from @simplewebauthn/browser
 * Sent to POST /api/auth/webauthn/register/verify
 */
export interface WebAuthnAttestationResponse {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string; // base64url
    attestationObject: string; // base64url
    clientExtensionResults?: Record<string, unknown>;
  };
  type: "public-key";
}

/**
 * Verification Result after successful registration
 * Returned by POST /api/auth/webauthn/register/verify
 */
export interface WebAuthnRegisterVerifyResponse {
  success: boolean;
  credentialId?: string;
  credentialName?: string;
  error?: string;
}

// ============================================================================
// Authentication (Passkey Login) Response from Server
// ============================================================================

/**
 * Options returned by POST /api/auth/webauthn/authenticate/options
 * These are passed directly to startAuthentication() from @simplewebauthn/browser
 */
export interface WebAuthnAuthenticationOptions {
  publicKey: {
    challenge: string; // base64url encoded challenge
    timeout?: number;
    rpId: string;
    allowCredentials: Array<{
      type: "public-key";
      id: string; // base64url
      transports?: ("usb" | "nfc" | "ble" | "internal" | "hybrid")[];
    }>;
    userVerification?: "discouraged" | "preferred" | "required";
    extensions?: Record<string, unknown>;
  };
}

/**
 * Assertion Response from Browser
 * Returned by startAuthentication() from @simplewebauthn/browser
 * Sent to POST /api/auth/webauthn/authenticate/verify
 */
export interface WebAuthnAssertionResponse {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string; // base64url
    authenticatorData: string; // base64url
    signature: string; // base64url
    userHandle: string | null; // base64url or null
    clientExtensionResults?: Record<string, unknown>;
  };
  type: "public-key";
}

/**
 * Verification Result after successful authentication
 * Returned by POST /api/auth/webauthn/authenticate/verify
 */
export interface WebAuthnAuthenticateVerifyResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    role: string;
  };
  redirectUrl?: string;
  requiresMfa?: boolean;
  tempToken?: string;
  error?: string;
}

// ============================================================================
// Credential Management
// ============================================================================

/**
 * Credential Info for listing
 */
export interface WebAuthnCredentialInfo {
  id: string;
  credentialName: string;
  createdAt: string;
  lastUsedAt: string | null;
  transports?: string[];
  aaguid?: string;
}

/**
 * Response from GET /api/auth/webauthn/credentials
 */
export interface WebAuthnCredentialsListResponse {
  credentials: WebAuthnCredentialInfo[];
}

/**
 * Request body for PATCH /api/auth/webauthn/credentials
 */
export interface WebAuthnRenameRequest {
  credentialId: string;
  credentialName: string;
}

/**
 * Response from PATCH /api/auth/webauthn/credentials
 */
export interface WebAuthnRenameResponse {
  id: string;
  credentialName: string;
  lastUsedAt: string | null;
}
