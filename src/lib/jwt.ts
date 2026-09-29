import { SignJWT, jwtVerify, JWTPayload } from "jose";

export interface JwtPayload extends JWTPayload {
  userId: string;
  role: string;
  type?: string;
  /** Set when the session was established with a second factor (2FA code,
   *  backup code or passkey), and carried across refreshes. */
  mfa?: boolean;
}

// Short-lived token proving only "password correct, 2FA setup required" -
// never a session. Lives in its own cookie and is refused by verifyJwtToken.
const ENROLLMENT_TOKEN_TYPE = "2fa_enroll";

// Read lazily (not at import time) so builds and public pages still load when
// the variable is missing; auth operations fail closed instead of falling back
// to a guessable secret.
const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
};

async function decodeJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecretKey(), {
    algorithms: ["HS256"], // Explicitly expect HS256
  });
  if (typeof payload.userId !== "string" || typeof payload.role !== "string") {
    throw new Error("Invalid token payload structure");
  }
  return payload as JwtPayload;
}

export async function verifyJwtToken(token: string): Promise<JwtPayload> {
  try {
    const payload = await decodeJwt(token);

    // A 2FA-enrollment token must never pass as a session, even if someone
    // copies it into the session cookie.
    if (payload.type === ENROLLMENT_TOKEN_TYPE) {
      throw new Error("Enrollment token is not a session");
    }

    // Blacklist check is skipped on Edge (middleware) - Prisma can't run
    // there. Sensitive server actions all go through Node-runtime API
    // routes, which do reach this check, so a token revoked at logout is
    // still rejected before it can do anything; only page-routing decisions
    // made by middleware itself don't see the revocation until the token's
    // own (short) expiry.
    if (process.env.NEXT_RUNTIME !== "edge") {
      const { isTokenBlacklisted } = await import("@/lib/auth/tokenBlacklist");
      if (await isTokenBlacklisted(token)) {
        throw new Error("Token has been revoked");
      }
    }

    return payload;
  } catch (error) {
    console.error("verifyJwtToken error:", error);
    throw new Error("Invalid or expired token");
  }
}

export async function signJwtToken(
  payload: Omit<JwtPayload, "exp">,
  expiresIn: "1h" | "7d" | "15m" | "2m" = "1h",
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecretKey());
}

export async function generateTokens(
  userId: string,
  role: string,
  { mfa = false }: { mfa?: boolean } = {},
) {
  const claims = mfa ? { userId, role, mfa: true } : { userId, role };
  const accessToken = await signJwtToken(claims);
  const refreshToken = await signJwtToken({ ...claims, type: "refresh" }, "7d");
  return { accessToken, refreshToken };
}

/** 15-minute token for the forced 2FA setup step after a correct password. */
export function signEnrollmentToken(userId: string, role: string) {
  return signJwtToken({ userId, role, type: ENROLLMENT_TOKEN_TYPE }, "15m");
}

/** Verifies a token from signEnrollmentToken; rejects any other token. */
export async function verifyEnrollmentToken(
  token: string,
): Promise<JwtPayload> {
  try {
    const payload = await decodeJwt(token);
    if (payload.type !== ENROLLMENT_TOKEN_TYPE) {
      throw new Error("Not an enrollment token");
    }
    return payload;
  } catch (error) {
    console.error("verifyEnrollmentToken error:", error);
    throw new Error("Invalid or expired enrollment token");
  }
}
