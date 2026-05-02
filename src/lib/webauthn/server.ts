/**
 * Server-Side WebAuthn Implementation
 * Using SimpleWebAuthn v11 library
 */

import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/types";

import { prisma } from "@/lib/prisma";
import { base64urlToBytes, bufferToBase64url } from "./utils";

function toUint8Array(value: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof value === "string") {
    return base64urlToBytes(value);
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  return new Uint8Array(value);
}

/**
 * In-memory challenge storage for development
 * In production, this should use Redis with expiration
 * 
 * Structure: Map<key, {challenge, expiresAt, used}>
 * Key format: "reg:{userId}:{timestamp}" or "auth:{userId}:{timestamp}"
 */
const challengeStorage = new Map<string, { challenge: string; expiresAt: number; used: boolean }>();

/**
 * Store a registration challenge with long TTL (10 minutes for registration process)
 * Uses timestamp to allow multiple pending challenges per user
 */
export function storeRegistrationChallenge(userId: string, challenge: string): string {
  const timestamp = Date.now();
  const key = `reg:${userId}:${timestamp}`;
  const _ttlSeconds = 600; // 10 minutes for registration (longer process)
  const expiresAt = timestamp + _ttlSeconds * 1000;
  
  challengeStorage.set(key, { challenge, expiresAt, used: false });

  // Auto-cleanup expired challenges
  setTimeout(() => {
    challengeStorage.delete(key);
  }, _ttlSeconds * 1000);

  console.log("Challenge stored:", { key, challenge: challenge.substring(0, 20) + "...", expiresAt });
  return key;
}

/**
 * Store an authentication challenge with normal TTL (5 minutes)
 * Uses timestamp to allow multiple pending challenges per user
 */
export function storeAuthenticationChallenge(userId: string, challenge: string): string {
  const timestamp = Date.now();
  const key = `auth:${userId}:${timestamp}`;
  const _ttlSeconds = 300; // 5 minutes for authentication
  const expiresAt = timestamp + _ttlSeconds * 1000;

  challengeStorage.set(key, { challenge, expiresAt, used: false });

  // Auto-cleanup expired challenges
  setTimeout(() => {
    challengeStorage.delete(key);
  }, _ttlSeconds * 1000);

  console.log("Auth challenge stored:", { key, challenge: challenge.substring(0, 20) + "...", expiresAt });
  return key;
}

/**
 * Retrieve and verify stored challenge (single-use)
 * Matches challenge by searching from most recent to oldest
 */
export function getStoredChallenge(userId: string, isRegistration: boolean = false): string | null {
  const prefix = isRegistration ? "reg:" : "auth:";
  const searchPrefix = `${prefix}${userId}:`;
  
  // Find all challenges for this user
  const userChallenges = Array.from(challengeStorage.entries())
    .filter(([key]) => key.startsWith(searchPrefix))
    .sort((a, b) => {
      // Sort by timestamp (key format: "prefix:userId:timestamp")
      const timestampA = parseInt(a[0].split(":")[2]);
      const timestampB = parseInt(b[0].split(":")[2]);
      return timestampB - timestampA; // Most recent first
    });

  // Find the most recent unused challenge
  for (const [key, stored] of userChallenges) {
    if (stored.expiresAt < Date.now()) {
      console.log("Challenge expired:", { key });
      challengeStorage.delete(key);
      continue;
    }

    if (stored.used) {
      console.log("Challenge already used:", { key });
      continue;
    }

    // Mark as used but don't delete yet (keep for debugging)
    stored.used = true;
    console.log("Challenge retrieved and marked as used:", { key });
    return stored.challenge;
  }

  console.warn("No valid challenge found for user:", { userId, isRegistration, prefix });
  return null;
}

// Legacy function for backward compatibility - calls the new registration function
export function storeChallenge(userId: string, challenge: string, ttlSeconds = 300): void {
  storeRegistrationChallenge(userId, challenge);
}

/**
 * Get expected origin for WebAuthn verification
 */
function getExpectedOrigin(): string {
  const url = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return new URL(url).origin;
}

/**
 * Get RP ID for WebAuthn
 */
function getWebAuthnRpId(): string {
  return process.env.WEBAUTHN_RP_ID || "localhost";
}

/**
 * Generate registration options for passkey setup
 */
export async function generateWebAuthnRegistrationOptions(user: {
  id: string;
  email: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const rpId = getWebAuthnRpId();
  const origin = getExpectedOrigin();
  
  console.log("Generating registration options", { 
    userId: user.id, 
    rpId,
    origin,
    userEmail: user.email 
  });
  
  const options = await generateRegistrationOptions({
    rpID: rpId,
    rpName: "BitFactory",
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.email || "BitFactory User",
    attestationType: "none",
    timeout: 120000, // Extended from 60s to 120s for mobile reliability
    authenticatorSelection: {
      // Passkeys are discoverable credentials, and Firefox/Windows Hello are more reliable
      // when we keep the library's recommended defaults instead of discouraging them.
      residentKey: "preferred",
      userVerification: "preferred",
    },
    supportedAlgorithmIDs: [-7, -257],
  });

  // Store challenge with extended TTL for registration
  storeRegistrationChallenge(user.id, options.challenge);
  
  console.log("Registration options generated", {
    hasChallenge: !!options.challenge,
    rpId: options.rp?.id,
  });

  return options;
}

/**
 * Verify WebAuthn registration response
 */
export async function verifyWebAuthnRegistration(
  user: { id: string; email: string },
  credential: RegistrationResponseJSON,
  expectedChallenge?: string
): Promise<{
  verified: boolean;
  credentialID: Uint8Array;
  credentialPublicKey: Uint8Array;
  counter: number;
}> {
  const challenge = expectedChallenge ?? getStoredChallenge(user.id, true);
  if (!challenge) {
    throw new Error("Challenge not found or expired");
  }

  try {
    const verified = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedRPID: getWebAuthnRpId(),
      expectedOrigin: getExpectedOrigin(),
      requireUserVerification: false,
      supportedAlgorithmIDs: [-7, -257],
    });

    console.log("SimpleWebAuthn verifyRegistrationResponse result:", {
      verified: verified.verified,
      hasRegistrationInfo: !!verified.registrationInfo,
      registrationInfoKeys: verified.registrationInfo ? Object.keys(verified.registrationInfo) : [],
    });

    if (!verified.verified || !verified.registrationInfo) {
      throw new Error("Registration verification failed");
    }

    // SimpleWebAuthn v11 returns credential data in registrationInfo
    const credentialData = verified.registrationInfo.credential as unknown;
    
    console.log("Extracted credential data:", {
      hasCredential: !!credentialData,
      credentialKeys: credentialData ? Object.keys(credentialData) : [],
      hasCredentialID: !!credentialData?.credentialID,
      credentialIDType: credentialData?.credentialID ? typeof credentialData.credentialID : "undefined",
      credentialIDLength: credentialData?.credentialID?.length,
      hasCredentialPublicKey: !!credentialData?.credentialPublicKey,
      publicKeyType: credentialData?.credentialPublicKey ? typeof credentialData.credentialPublicKey : "undefined",
      publicKeyLength: credentialData?.credentialPublicKey?.length,
      counter: credentialData?.counter,
    });
    
    if (!credentialData) {
      throw new Error("Missing credential information from registration");
    }

    const normalizedCredentialID = toUint8Array(
      credentialData.credentialID || credentialData.id
    );
    const normalizedPublicKey = toUint8Array(
      credentialData.credentialPublicKey || credentialData.publicKey
    );

    return {
      verified: true,
      credentialID: normalizedCredentialID,
      credentialPublicKey: normalizedPublicKey,
      counter: credentialData.counter || 0,
    };
  } catch (error) {
    console.error("Registration verification error details:", error);
    throw new Error(
      `Registration verification error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate authentication options for passkey login
 */
export async function generateWebAuthnAuthenticationOptions(
  email: string
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, webauthnCredentials: { select: { credentialId: true, transports: true } } },
  });

  let allowCredentials: Array<{ type: "public-key"; id: string; transports?: ("usb" | "nfc" | "ble" | "internal" | "hybrid")[] }> = [];

  // If user exists and has credentials, provide list
  if (user && user.webauthnCredentials && user.webauthnCredentials.length > 0) {
    allowCredentials = user.webauthnCredentials.map((cred) => ({
      type: "public-key" as const,
      id: bufferToBase64url(cred.credentialId),
      transports: (cred.transports as
        | ("usb" | "nfc" | "ble" | "internal" | "hybrid")[]
        | undefined) || [
        "internal",
        "usb",
        "ble",
        "nfc",
        "hybrid",
      ],
    }));
  }

  const options = await generateAuthenticationOptions({
    rpID: getWebAuthnRpId(),
    timeout: 120000, // Extended from 60s to 120s for mobile reliability
    allowCredentials,
    userVerification: "preferred",
  });

  if (user) {
    storeAuthenticationChallenge(user.id, options.challenge);
  } else {
    // Store with a throwaway key for non-existent users (don't store for real)
    // This prevents user enumeration but doesn't store meaningful challenge
  }

  return options;
}

/**
 * Verify WebAuthn authentication response
 */
export async function verifyWebAuthnAuthentication(
  userId: string,
  credential: AuthenticationResponseJSON,
  expectedChallenge?: string
): Promise<{
  verified: boolean;
  credentialID: string;
  newCounter: number;
}> {
  const challenge = expectedChallenge ?? getStoredChallenge(userId, false);
  if (!challenge) {
    throw new Error("Challenge not found or expired");
  }

  // Get user's credential to verify against
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      webauthnCredentials: {
        select: {
          id: true,
          credentialId: true,
          publicKey: true,
          counter: true,
        },
      },
    },
  });

  if (!user || !user.webauthnCredentials || user.webauthnCredentials.length === 0) {
    throw new Error("No credentials found for user");
  }

  console.log("WebAuthn auth verify: Looking up credential", {
    userId,
    credentialIdFromResponse: credential.id.substring(0, 20) + "...",
    credentialCount: user.webauthnCredentials.length,
  });

  // Find the matching credential
  const matchingCredentialData = user.webauthnCredentials.find(
    (cred) => bufferToBase64url(cred.credentialId) === credential.id
  );

  if (!matchingCredentialData) {
    console.error("WebAuthn auth verify: Credential not found", {
      userId,
      responseId: credential.id.substring(0, 20) + "...",
      storedIds: user.webauthnCredentials.map((c) => bufferToBase64url(c.credentialId).substring(0, 20) + "..."),
    });
    throw new Error("Credential not found");
  }

  console.log("WebAuthn auth verify: Found matching credential", {
    userId,
    credentialDbId: matchingCredentialData.id,
  });

  try {
    const verified = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge,
      expectedRPID: getWebAuthnRpId(),
      expectedOrigin: getExpectedOrigin(),
      requireUserVerification: false,
      credential: {
        id: credential.id,
        publicKey: matchingCredentialData.publicKey as unknown as Uint8Array,
        counter: matchingCredentialData.counter,
      },
    });

    if (!verified.verified) {
      throw new Error("Authentication verification failed");
    }

    console.log("WebAuthn auth verify: Verification successful", {
      userId,
      oldCounter: matchingCredentialData.counter,
      newCounter: verified.authenticationInfo.newCounter,
    });

    // Validate counter to detect cloning attacks
    if (verified.authenticationInfo.newCounter <= matchingCredentialData.counter) {
      // Counter didn't increment or decreased - potential cloning attack
      if (verified.authenticationInfo.newCounter < matchingCredentialData.counter) {
        console.error("WebAuthn auth verify: Counter decreased - possible cloning attack", {
          userId,
          oldCounter: matchingCredentialData.counter,
          newCounter: verified.authenticationInfo.newCounter,
        });
        throw new Error(
          "Counter mismatch: possible authenticator cloning detected. Please re-register your authenticator."
        );
      }
      // Counter stayed the same - unusual but not necessarily an attack
      console.warn("WebAuthn auth verify: Counter unchanged", {
        userId,
        counter: matchingCredentialData.counter,
      });
    }

    return {
      verified: true,
      credentialID: matchingCredentialData.id,
      newCounter: verified.authenticationInfo.newCounter,
    };
  } catch (error) {
    console.error("WebAuthn auth verify: Error during verification", {
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw new Error(
      `Authentication verification error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
