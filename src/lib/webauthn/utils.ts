/**
 * WebAuthn Utility Functions
 * Base64URL encoding/decoding, browser detection, and common helpers
 */

/**
 * Convert ArrayBuffer to Base64URL string
 * @param buffer - ArrayBuffer or Uint8Array to convert
 * @returns Base64URL encoded string
 */
export function bufferToBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let str = "";
  for (let i = 0; i < view.length; i++) {
    str += String.fromCharCode(view[i]);
  }
  const binaryString = str;
  const base64 = Buffer.from(binaryString, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Convert Base64URL string to ArrayBuffer
 * @param base64url - Base64URL encoded string
 * @returns ArrayBuffer
 */
export function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padLength);
  const binary = Buffer.from(padded, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert Bytes to Base64URL string
 * @param bytes - Bytes to convert
 * @returns Base64URL encoded string
 */
export function bytesToBase64url(bytes: Buffer | Uint8Array): string {
  return bufferToBase64url(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

/**
 * Convert Base64URL string to Buffer
 * @param base64url - Base64URL encoded string
 * @returns Buffer
 */
export function base64urlToBytes(base64url: string): Buffer {
  return Buffer.from(base64urlToBuffer(base64url));
}

/**
 * Check if WebAuthn is supported in current environment
 * @returns true if WebAuthn is supported, false otherwise
 */
export function isWebAuthnSupported(): boolean {
  if (typeof window === "undefined") {
    return false; // Server-side
  }

  return (
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === "function"
  );
}

/**
 * Check if platform authenticators are available (biometric, Windows Hello, etc.)
 * @returns Promise<boolean> - true if platform authenticators are available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !isWebAuthnSupported()) {
    return false;
  }

  try {
    const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch {
    return false;
  }
}

/**
 * Generate a random challenge for WebAuthn
 * @param length - Length of challenge in bytes (default 32)
 * @returns Base64URL encoded challenge
 */
export function generateChallenge(length: number = 32): string {
  const buffer = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return bufferToBase64url(buffer.buffer);
}

/**
 * Get transports from WebAuthn response if available
 * @param response - AuthenticatorAttestationResponse or AuthenticatorAssertionResponse
 * @returns Array of transport strings or empty array
 */
export function getTransports(
  response: AuthenticatorAttestationResponse | AuthenticatorAssertionResponse | unknown
): string[] {
  if ((response as any)?.getTransports && typeof (response as any)?.getTransports === "function") {
    try {
      return (response as any).getTransports() || [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Extract error message from WebAuthn errors
 * @param error - Error object
 * @returns User-friendly error message
 */
export function getWebAuthnErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
        return "WebAuthn was cancelled or no passkey was found. Please try again.";
      case "InvalidStateError":
        return "This passkey is already registered on this account.";
      case "NotSupportedError":
        return "WebAuthn is not supported on this device or browser.";
      case "AbortError":
        return "The WebAuthn operation was aborted.";
      case "TimeoutError":
        return "The WebAuthn operation timed out. Please try again.";
      default:
        return error.message || "An error occurred during authentication.";
    }
  }

  return (error as any)?.message || "An unknown error occurred.";
}

/**
 * Format transports for display (convert "internal" to "Platform" etc.)
 * @param transports - Array of transport strings
 * @returns Formatted string for display
 */
export function formatTransports(transports: string[] = []): string {
  if (!transports || transports.length === 0) {
    return "Unknown";
  }

  const formatted = transports.map((t) => {
    switch (t) {
      case "internal":
        return "Platform";
      case "usb":
        return "USB";
      case "ble":
        return "Bluetooth";
      case "nfc":
        return "NFC";
      case "hybrid":
        return "Phone";
      default:
        return t.charAt(0).toUpperCase() + t.slice(1);
    }
  });

  return formatted.join(", ");
}
