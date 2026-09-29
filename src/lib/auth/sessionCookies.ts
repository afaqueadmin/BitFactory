import type { NextResponse } from "next/server";

/** Cookie holding the 15-minute forced-2FA-setup token (see jwt.ts). */
export const ENROLLMENT_COOKIE = "two_factor_enroll";
const ENROLLMENT_COOKIE_PATH = "/api/auth/2fa/enroll";

/** Cookie holding the 5-minute "password verified, 2FA code pending" token. */
export const PENDING_2FA_COOKIE = "two_factor_pending";
const PENDING_2FA_COOKIE_PATH = "/api/auth/2fa/validate";

const secure = () => process.env.NODE_ENV === "production";

export function redirectPathForRole(role: string): string {
  switch (role) {
    case "ADMIN":
    case "SUPER_ADMIN":
      return "/adminpanel";
    case "FRANCHISEE":
      return "/franchise/dashboard";
    default:
      return "/dashboard";
  }
}

export function setSessionCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookies.set("token", accessToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    maxAge: 60 * 60, // 1 hour
    path: "/",
  });
  response.cookies.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: "/",
  });
}

/** Scoped to the enroll routes only, so it's never sent anywhere else. */
export function setEnrollmentCookie(
  response: NextResponse,
  token: string,
): void {
  response.cookies.set(ENROLLMENT_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    maxAge: 15 * 60,
    path: ENROLLMENT_COOKIE_PATH,
  });
}

export function clearEnrollmentCookie(response: NextResponse): void {
  response.cookies.set(ENROLLMENT_COOKIE, "", {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    maxAge: 0,
    path: ENROLLMENT_COOKIE_PATH,
  });
}

/** Scoped to /api/auth/2fa/validate only. */
export function setPendingTwoFactorCookie(
  response: NextResponse,
  token: string,
): void {
  response.cookies.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    maxAge: 5 * 60,
    path: PENDING_2FA_COOKIE_PATH,
  });
}

export function clearPendingTwoFactorCookie(response: NextResponse): void {
  response.cookies.set(PENDING_2FA_COOKIE, "", {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    maxAge: 0,
    path: PENDING_2FA_COOKIE_PATH,
  });
}
