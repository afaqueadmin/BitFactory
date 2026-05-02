import {
  startRegistration,
  browserSupportsWebAuthnAutofill,
} from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import {
  isPlatformAuthenticatorAvailable,
  isWebAuthnSupported,
} from "@/lib/webauthn/utils";

/**
 * Type guard and error extractor for unknown caught errors
 */
function getErrorDetails(error: unknown): {
  name: string;
  message: string;
  code?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  const errorObj = error as Record<string, unknown>;
  return {
    name: String(errorObj?.name ?? "Unknown"),
    message: String(errorObj?.message ?? String(error)),
    code: String(errorObj?.code ?? ""),
    stack: String(errorObj?.stack ?? ""),
  };
}

/**
 * Client-side WebAuthn registration (passkey setup)
 * Called from security settings page
 */
export async function registerPasskey(credentialName?: string): Promise<{
  success: boolean;
  credentialId?: string;
  error?: string;
}> {
  try {
    if (!isWebAuthnSupported()) {
      return {
        success: false,
        error: "This browser does not support WebAuthn passkeys.",
      };
    }

    const platformAuthenticatorAvailable =
      await isPlatformAuthenticatorAvailable();
    const browserInfo =
      typeof navigator === "undefined" ? "unknown" : navigator.userAgent;

    console.log("WebAuthn registration environment", {
      platformAuthenticatorAvailable,
      browserInfo,
    });

    // Get registration options from server
    const optionsResponse = await fetch("/api/auth/webauthn/register/options", {
      method: "POST",
      credentials: "include",
    });

    if (!optionsResponse.ok) {
      const errorData = await optionsResponse.json().catch(() => ({}));
      console.error("Failed to get registration options:", {
        status: optionsResponse.status,
        error: errorData,
      });
      return {
        success: false,
        error: `Failed to get registration options (${optionsResponse.status}): ${errorData.error || "Unknown error"}`,
      };
    }

    const options: PublicKeyCredentialCreationOptionsJSON =
      await optionsResponse.json();

    console.log("Registration options received", {
      rpId: options.rp?.id,
      userId: options.user?.id,
      challenge: options.challenge.substring(0, 20) + "...",
    });

    // Start registration ceremony - wrap options in optionsJSON property
    let attResp: unknown;
    try {
      console.log("Starting WebAuthn registration ceremony", {
        timeout: options.timeout,
        rpId: options.rp?.id,
        attestation: options.attestation,
        authenticatorSelection: options.authenticatorSelection,
        platformAuthenticatorAvailable,
      });

      attResp = await startRegistration({ optionsJSON: options });

      const attestResp = attResp as Record<string, unknown>;
      console.log("WebAuthn registration ceremony completed successfully", {
        hasAttestationObject: !!attestResp?.response?.attestationObject,
        hasClientDataJSON: !!attestResp?.response?.clientDataJSON,
      });
    } catch (error: unknown) {
      const errorDetails = getErrorDetails(error);
      const errorMsg = errorDetails.message || "Registration ceremony failed";

      console.error("WebAuthn registration ceremony detailed error:", {
        errorName: errorDetails.name,
        errorCode: errorDetails.code,
        errorMessage: errorDetails.message,
        errorStack: errorDetails.stack,
        timestamp: new Date().toISOString(),
      });

      // Specific handling for NotAllowedError (mobile timeout/user gesture issues)
      if (errorDetails.name === "NotAllowedError") {
        console.error("WebAuthn NotAllowedError Details:", {
          possibleCauses: [
            "User canceled the biometric prompt",
            "Device biometric failed or timed out",
            "Device was locked or screen turned off",
            "Authenticator doesn't support the requested options",
            "Browser lost focus during authentication",
          ],
          message: errorMsg,
        });
        return {
          success: false,
          error: `Registration canceled or timeout: ${errorMsg}. Please ensure:\n• Your device is unlocked\n• You complete the biometric prompt promptly\n• The app stays in focus during authentication`,
        };
      }

      // Specific handling for other security errors
      if (errorDetails.name === "SecurityError") {
        console.error("WebAuthn SecurityError:", error);
        return {
          success: false,
          error:
            "Security error: Make sure you're accessing from a secure context (HTTPS) or localhost.",
        };
      }

      // Specific handling for unsupported authenticator
      if (errorDetails.name === "NotSupportedError") {
        console.error("WebAuthn NotSupportedError:", error);
        return {
          success: false,
          error:
            "Your authenticator doesn't support this operation. Your device may not have biometric authentication configured.",
        };
      }

      if (errorDetails.name === "UnknownError") {
        const isFirefox = /firefox/i.test(browserInfo);
        const platformHint = !platformAuthenticatorAvailable
          ? " No platform authenticator is available in this browser profile or OS setup."
          : "";

        return {
          success: false,
          error: isFirefox
            ? `Firefox could not create a passkey with the available authenticator.${platformHint} If Windows Hello or your OS passkey provider is not configured in Firefox, try Chrome or configure a usable authenticator first.`
            : `The authenticator could not create a new credential.${platformHint} Check that a biometric or security-key authenticator is configured for this browser.`,
        };
      }

      console.error("WebAuthn registration ceremony error:", error);
      return {
        success: false,
        error: `WebAuthn Error: ${errorMsg}. This usually means an origin/domain mismatch or the authenticator timed out.`,
      };
    }

    // Verify registration on server
    const verifyResponse = await fetch("/api/auth/webauthn/register/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        id: (attestResp as Record<string, unknown>).id,
        rawId: (attestResp as Record<string, unknown>).rawId,
        response: {
          clientDataJSON: (
            (attestResp as Record<string, unknown>).response as Record<
              string,
              unknown
            >
          ).clientDataJSON,
          attestationObject: (
            (attestResp as Record<string, unknown>).response as Record<
              string,
              unknown
            >
          ).attestationObject,
        },
        type: (attestResp as Record<string, unknown>).type,
        credentialName: credentialName || "My Passkey",
        transports:
          (
            (attestResp as Record<string, unknown>).response as Record<
              string,
              unknown
            >
          ).transports || [],
      }),
    });

    console.log("Verify response status:", {
      status: verifyResponse.status,
      statusText: verifyResponse.statusText,
      ok: verifyResponse.ok,
    });

    if (!verifyResponse.ok) {
      let errorData: Record<string, unknown> = {};
      try {
        errorData = await verifyResponse.json();
        console.error("Registration verification failed response:", {
          status: verifyResponse.status,
          body: errorData,
        });
      } catch {
        const text = await verifyResponse.text();
        console.error("Registration verification failed (non-JSON response):", {
          status: verifyResponse.status,
          text: text.substring(0, 200),
        });
        return {
          success: false,
          error: `Server error (${verifyResponse.status}): ${text.substring(0, 100)}`,
        };
      }

      const errorMessage =
        (errorData.error as string) ||
        (errorData.message as string) ||
        (errorData.details as string) ||
        `Server error (${verifyResponse.status})`;

      return {
        success: false,
        error: errorMessage,
      };
    }

    const verified = (await verifyResponse.json()) as Record<string, unknown>;
    console.log("Passkey registered successfully", {
      credentialId: verified.credentialId,
    });
    return {
      success: true,
      credentialId: verified.credentialId as string,
    };
  } catch (error: unknown) {
    console.error("Passkey registration error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg || "Passkey registration failed",
    };
  }
}

/**
 * Check if autofill UI is supported (platform authenticator passkeys)
 */
export async function supportsWebAuthnAutofill(): Promise<boolean> {
  try {
    return await browserSupportsWebAuthnAutofill();
  } catch {
    return false;
  }
}

/**
 * Delete a passkey credential
 */
export async function deletePasskey(credentialId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const response = await fetch(
      `/api/auth/webauthn/credentials?id=${credentialId}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.error || "Failed to delete passkey",
      };
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    const errorMsg =
      error instanceof Error ? error.message : "Failed to delete passkey";
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Rename a passkey credential
 */
export async function renamePasskey(
  credentialId: string,
  newName: string,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const response = await fetch("/api/auth/webauthn/credentials", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        credentialId,
        credentialName: newName,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.error || "Failed to rename passkey",
      };
    }

    return {
      success: true,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Get all passkey credentials for current user
 */
export async function getPasskeys(): Promise<{
  success: boolean;
  credentials?: Array<{
    id: string;
    credentialName: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
  error?: string;
}> {
  try {
    const response = await fetch("/api/auth/webauthn/credentials", {
      method: "GET",
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.error || "Failed to get passkeys",
      };
    }

    const data = await response.json();
    return {
      success: true,
      credentials: data.credentials,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMsg,
    };
  }
}
