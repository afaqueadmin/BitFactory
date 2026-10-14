import { SignJWT, jwtVerify, JWTPayload } from "jose";

export interface JwtPayload extends JWTPayload {
  userId: string;
  /** The UserLogin (email + credentials) the token was issued to. An account
   *  can have more than one login; userId is the account they all open. */
  loginId: string;
  role: string;
  type?: string;
  /** Set when the session was established with a second factor (2FA code,
   *  backup code or passkey), and carried across refreshes. */
  mfa?: boolean;
}

/** Who a token is issued to: the account, the login on it, and its role. */
export interface TokenSubject {
  userId: string;
  loginId: string;
  role: string;
}

// Short-lived tokens that prove one step of a login, never a session. Each
// lives in its own path-scoped cookie and verifyJwtToken refuses them.
//   2fa_enroll:  password correct, 2FA must be set up now (M-1)
//   2fa_pending: password correct, 2FA code still to be entered (C-3)
//   webauthn_reg: a passkey-registration challenge bound to one user (C-2)
const ENROLLMENT_TOKEN_TYPE = "2fa_enroll";
const PENDING_2FA_TOKEN_TYPE = "2fa_pending";
const WEBAUTHN_REG_TOKEN_TYPE = "webauthn_reg";
//   webauthn_auth: a passkey sign-in challenge bound to one user (N-5)
const WEBAUTHN_AUTH_TOKEN_TYPE = "webauthn_auth";
//   pwd_reset: the emailed forgotten-password link for one user (C-1)
const PASSWORD_RESET_TOKEN_TYPE = "pwd_reset";
const NON_SESSION_TYPES = new Set([
  ENROLLMENT_TOKEN_TYPE,
  PENDING_2FA_TOKEN_TYPE,
  WEBAUTHN_REG_TOKEN_TYPE,
  WEBAUTHN_AUTH_TOKEN_TYPE,
  PASSWORD_RESET_TOKEN_TYPE,
]);

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
  // loginId: tokens from before multi-login don't carry one and are refused,
  // which means one fresh sign-in for everyone after that release.
  if (
    typeof payload.userId !== "string" ||
    typeof payload.loginId !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new Error("Invalid token payload structure");
  }
  return payload as JwtPayload;
}

/**
 * Rejects a token that was logged out (blacklisted) or issued before the
 * account, or this login on it, was signed out everywhere (N-2).
 *
 * Skipped on Edge (the proxy) - Prisma can't run there. Sensitive server
 * actions all go through Node-runtime API routes, which do reach this check,
 * so a revoked token is still rejected before it can do anything; only
 * page-routing decisions made by the proxy itself don't see the revocation
 * until the token's own (short) expiry.
 */
async function assertNotRevoked(
  token: string,
  payload: JwtPayload,
): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { isTokenBlacklisted, isTokenRevokedForUser } =
    await import("@/lib/auth/tokenBlacklist");
  const [blacklisted, revoked] = await Promise.all([
    isTokenBlacklisted(token),
    isTokenRevokedForUser(payload.userId, payload.loginId, payload.iat),
  ]);
  if (blacklisted || revoked) {
    throw new Error("Token has been revoked");
  }
}

export async function verifyJwtToken(token: string): Promise<JwtPayload> {
  try {
    const payload = await decodeJwt(token);

    // A login-step token must never pass as a session, even if someone
    // copies it into the session cookie.
    if (payload.type && NON_SESSION_TYPES.has(payload.type)) {
      throw new Error(`${payload.type} token is not a session`);
    }

    await assertNotRevoked(token, payload);
    return payload;
  } catch (error) {
    console.error("verifyJwtToken error:", error);
    throw new Error("Invalid or expired token");
  }
}

export async function signJwtToken(
  payload: Omit<JwtPayload, "exp">,
  expiresIn: "24h" | "1h" | "7d" | "30m" | "15m" | "10m" | "5m" | "2m" = "1h",
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecretKey());
}

export async function generateTokens(
  { userId, loginId, role }: TokenSubject,
  { mfa = false }: { mfa?: boolean } = {},
) {
  const claims = mfa
    ? { userId, loginId, role, mfa: true }
    : { userId, loginId, role };
  const accessToken = await signJwtToken(claims);
  const refreshToken = await signJwtToken({ ...claims, type: "refresh" }, "7d");
  return { accessToken, refreshToken };
}

/** 15-minute token for the forced 2FA setup step after a correct password. */
export function signEnrollmentToken({ userId, loginId, role }: TokenSubject) {
  return signJwtToken(
    { userId, loginId, role, type: ENROLLMENT_TOKEN_TYPE },
    "15m",
  );
}

/** Verifies a token from signEnrollmentToken; rejects any other token. */
export function verifyEnrollmentToken(token: string): Promise<JwtPayload> {
  return verifyLoginStepToken(token, ENROLLMENT_TOKEN_TYPE, "enrollment");
}

/**
 * 5-minute token issued by /api/login after a correct password for a login
 * with 2FA; /api/auth/2fa/validate requires it, so a 2FA or backup code
 * alone can never log anyone in (C-3).
 */
export function signPendingTwoFactorToken({
  userId,
  loginId,
  role,
}: TokenSubject) {
  return signJwtToken(
    { userId, loginId, role, type: PENDING_2FA_TOKEN_TYPE },
    "5m",
  );
}

/** Verifies a token from signPendingTwoFactorToken; rejects any other token. */
export function verifyPendingTwoFactorToken(
  token: string,
): Promise<JwtPayload> {
  return verifyLoginStepToken(token, PENDING_2FA_TOKEN_TYPE, "pending 2FA");
}

/**
 * Wraps a passkey-registration challenge with the login it was issued to, so
 * /register/verify can't complete a ceremony started under another login
 * (and only a login that passed step-up at /register/options gets one).
 */
export function signRegistrationChallenge(
  { userId, loginId, role }: TokenSubject,
  challenge: string,
) {
  return signJwtToken(
    { userId, loginId, role, type: WEBAUTHN_REG_TOKEN_TYPE, challenge },
    "10m",
  );
}

export async function verifyRegistrationChallenge(
  token: string,
): Promise<{ userId: string; loginId: string; challenge: string }> {
  const payload = await verifyLoginStepToken(
    token,
    WEBAUTHN_REG_TOKEN_TYPE,
    "passkey registration",
  );
  if (typeof payload.challenge !== "string") {
    throw new Error("Invalid or expired passkey registration token");
  }
  return {
    userId: payload.userId,
    loginId: payload.loginId,
    challenge: payload.challenge,
  };
}

/**
 * Wraps a passkey sign-in challenge with the login it was issued for (N-5).
 * The server, not the browser, decides the challenge: /authenticate/verify
 * only accepts a challenge it signed, for that same login, and spends the
 * token on success so a captured sign-in can't be replayed.
 */
export function signAuthenticationChallenge(
  { userId, loginId }: { userId: string; loginId: string },
  challenge: string,
) {
  // Fixed role: the token is issued for any email (N-4 decoys included), so
  // it must not vary with what kind of account, if any, the email has.
  return signJwtToken(
    {
      userId,
      loginId,
      role: "PASSKEY",
      type: WEBAUTHN_AUTH_TOKEN_TYPE,
      challenge,
    },
    "5m",
  );
}

export async function verifyAuthenticationChallenge(token: string): Promise<{
  userId: string;
  loginId: string;
  challenge: string;
  exp?: number;
}> {
  const payload = await verifyLoginStepToken(
    token,
    WEBAUTHN_AUTH_TOKEN_TYPE,
    "passkey sign-in",
  );
  if (typeof payload.challenge !== "string") {
    throw new Error("Invalid or expired passkey sign-in token");
  }
  return {
    userId: payload.userId,
    loginId: payload.loginId,
    challenge: payload.challenge,
    exp: payload.exp,
  };
}

/**
 * Token for the forgotten-password link (C-1), 30 minutes by default; the
 * set-password invite for a newly added login uses 24h. `pwd` is a
 * fingerprint of that login's password hash at the time it was sent, so the
 * link dies as soon as the password changes - after it's used, or any other
 * reset.
 */
export function signPasswordResetToken(
  { userId, loginId, role }: TokenSubject,
  pwd: string,
  expiresIn: "30m" | "24h" = "30m",
) {
  return signJwtToken(
    { userId, loginId, role, type: PASSWORD_RESET_TOKEN_TYPE, pwd },
    expiresIn,
  );
}

export async function verifyPasswordResetToken(token: string): Promise<{
  userId: string;
  loginId: string;
  pwd: string;
  exp?: number;
}> {
  const payload = await verifyLoginStepToken(
    token,
    PASSWORD_RESET_TOKEN_TYPE,
    "password reset",
  );
  if (typeof payload.pwd !== "string") {
    throw new Error("Invalid or expired password reset token");
  }
  return {
    userId: payload.userId,
    loginId: payload.loginId,
    pwd: payload.pwd,
    exp: payload.exp,
  };
}

async function verifyLoginStepToken(
  token: string,
  type: string,
  label: string,
): Promise<JwtPayload> {
  try {
    const payload = await decodeJwt(token);
    if (payload.type !== type) {
      throw new Error(`Not a ${label} token`);
    }
    // A password or 2FA change also cancels a login that was half done.
    await assertNotRevoked(token, payload);
    return payload;
  } catch (error) {
    console.error(`verify ${label} token error:`, error);
    throw new Error(`Invalid or expired ${label} token`);
  }
}
