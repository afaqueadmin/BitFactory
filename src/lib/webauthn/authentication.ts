import {
  startAuthentication,
  browserSupportsWebAuthnAutofill,
} from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";

/**
 * Type guard and error extractor for unknown caught errors
 */
function getErrorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  const errorObj = error as Record<string, unknown>;
  return {
    name: String(errorObj?.name ?? "Unknown"),
    message: String(errorObj?.message ?? String(error)),
  };
}

/**
 * Client-side WebAuthn authentication (passkey login)
 * Called from login page
 */
export async function authenticateWithPasskey(email: string): Promise<{
  success: boolean;
  redirectUrl?: string;
  requiresMfa?: boolean;
  error?: string;
}> {
  try {
    // Get authentication options from server
    const optionsResponse = await fetch(
      "/api/auth/webauthn/authenticate/options",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      },
    );

    if (!optionsResponse.ok) {
      return {
        success: false,
        error: "Failed to get authentication options from server",
      };
    }

    const options: PublicKeyCredentialRequestOptionsJSON =
      await optionsResponse.json();

    // Start authentication ceremony - wrap options in optionsJSON property
    let assertionResponse: unknown;
    try {
      assertionResponse = await startAuthentication({ optionsJSON: options });
    } catch (error: unknown) {
      const errorDetails = getErrorDetails(error);
      const errorMsg = errorDetails.message || "Authentication ceremony failed";

      // Specific handling for NotAllowedError (mobile timeout/user gesture issues)
      if (errorDetails.name === "NotAllowedError") {
        console.error("WebAuthn authentication NotAllowedError:", error);
        return {
          success: false,
          error: `Authentication timed out or was not allowed. Please try again. ${errorMsg}`,
        };
      }

      // Specific handling for user cancellation
      if (errorDetails.name === "AbortError") {
        console.error("WebAuthn authentication was cancelled");
        return {
          success: false,
          error: "Authentication was cancelled. Please try again.",
        };
      }

      console.error("WebAuthn authentication ceremony error:", error);
      return {
        success: false,
        error: errorMsg || "Authentication ceremony failed",
      };
    }

    // Type assertion for assertionResponse from WebAuthn API
    const assertion = assertionResponse as Record<string, unknown>;

    // Verify assertion on server
    const verifyResponse = await fetch(
      "/api/auth/webauthn/authenticate/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          assertion: {
            id: assertion.id,
            rawId: assertion.rawId,
            response: {
              clientDataJSON: (assertion.response as Record<string, unknown>).clientDataJSON,
              authenticatorData: (assertion.response as Record<string, unknown>).authenticatorData,
              signature: (assertion.response as Record<string, unknown>).signature,
              userHandle: (assertion.response as Record<string, unknown>).userHandle,
            },
            type: assertion.type,
          },
        }),
      },
    );

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      return {
        success: false,
        error: error.error || "Authentication failed",
      };
    }

    const verified = await verifyResponse.json();

    // Handle 2FA requirement
    if (verified.requiresMfa) {
      return {
        success: false, // Return false so we can handle 2FA separately
        requiresMfa: true,
      };
    }

    return {
      success: true,
      redirectUrl: verified.redirectUrl,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg || "Passkey authentication failed",
    };
  }
}

/**
 * Check if autofill form fill-in (conditional UI) is supported
 */
export async function supportsWebAuthnAutofill(): Promise<boolean> {
  try {
    return await browserSupportsWebAuthnAutofill();
  } catch {
    return false;
  }
}

/**
 * Helper to decode authenticator data for debugging
 */
export function decodeAuthenticatorData(authenticatorData: ArrayBuffer): {
  rpIdHash: string;
  userPresent: boolean;
  userVerified: boolean;
  hasCredentialData: boolean;
  hasAttestationData: boolean;
} {
  const data = new Uint8Array(authenticatorData);

  if (data.length < 37) {
    throw new Error("Authenticator data too short");
  }

  const rpIdHash = Buffer.from(data.slice(0, 32)).toString("base64url");
  const flags = data[32];

  const userPresent = !!(flags & 0x01);
  const userVerified = !!(flags & 0x04);
  const hasCredentialData = !!(flags & 0x40);
  const hasAttestationData = !!(flags & 0x80);

  return {
    rpIdHash,
    userPresent,
    userVerified,
    hasCredentialData,
    hasAttestationData,
  };
}
