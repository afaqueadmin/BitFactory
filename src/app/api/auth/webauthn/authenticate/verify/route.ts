import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalEmail } from "@/lib/auth/emailIdentity";
import { verifyWebAuthnAuthentication } from "@/lib/webauthn/server";
import { WebAuthnAssertionResponse } from "@/types/webauthn";
import { Prisma } from "@prisma/client";
import { generateTokens, verifyAuthenticationChallenge } from "@/lib/jwt";
import {
  redirectPathForRole,
  setSessionCookies,
} from "@/lib/auth/sessionCookies";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import {
  clearAuthRateLimitForEmail,
  enforceAuthRateLimit,
  getClientIp,
} from "@/lib/rateLimit";

export const runtime = "nodejs";

function getWebAuthnConfig(request: NextRequest): {
  origin: string;
  rpId: string;
} {
  return {
    origin: request.nextUrl.origin,
    rpId: request.nextUrl.hostname,
  };
}

/**
 * POST /api/auth/webauthn/authenticate/verify
 * Verify assertion response and authenticate user
 */
/** The one failure reply for every "can't proceed" case (N-4). */
function authenticationFailed() {
  const response = NextResponse.json(
    { error: "Authentication failed" },
    { status: 401 },
  );
  response.cookies.set("webauthn_auth_challenge", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const { email, assertion } = await request.json();

    if (!email || !assertion) {
      console.warn("WebAuthn authenticate verify: Missing email or assertion");
      return NextResponse.json(
        { error: "Email and assertion required" },
        { status: 400 },
      );
    }

    // H-1: a full, independent login entry point (see C-3/Chain B), so it
    // gets the same attempt limits as password login.
    const limited = await enforceAuthRateLimit("webauthn_authenticate", {
      email,
      ip: getClientIp(request.headers),
    });
    if (limited) return limited;

    const response: WebAuthnAssertionResponse = assertion;

    if (!response || !response.id) {
      console.warn("WebAuthn authenticate verify: Invalid assertion response");
      return NextResponse.json(
        { error: "Invalid assertion response" },
        { status: 400 },
      );
    }

    // N-4: every "can't proceed" case below answers the same 401, and the
    // challenge is checked before the account is looked up, so the reply
    // never says whether the email has an account or any passkeys.
    //
    // N-5: only a challenge this server signed and not used before
    // (verifyAuthenticationChallenge rejects spent tokens).
    const challengeToken = request.cookies.get(
      "webauthn_auth_challenge",
    )?.value;
    let bound: { userId: string; challenge: string } | null = null;
    if (challengeToken) {
      try {
        bound = await verifyAuthenticationChallenge(challengeToken);
      } catch {
        bound = null;
      }
    }
    if (!challengeToken || !bound) {
      console.warn(
        "WebAuthn authenticate verify: Missing or invalid challenge",
      );
      return authenticationFailed();
    }

    // Same account rule as password login: a deleted account can't sign in,
    // even with a passkey it registered before it was deleted (N-3).
    const user = await prisma.user.findFirst({
      where: { email: canonicalEmail(email), isDeleted: false },
      select: {
        id: true,
        email: true,
        role: true,
        webauthnCredentials: {
          select: { id: true, credentialId: true },
        },
      },
    });

    // The challenge must have been issued for this same account. A decoy
    // challenge (email without an account or passkeys) never matches.
    if (
      !user ||
      user.webauthnCredentials.length === 0 ||
      bound.userId !== user.id
    ) {
      console.warn(
        "WebAuthn authenticate verify: No matching account/passkey",
        {
          email,
        },
      );
      return authenticationFailed();
    }
    const expectedChallenge = bound.challenge;

    // Verify the assertion
    let verified;
    try {
      console.log("WebAuthn authenticate verify: Starting verification", {
        userId: user.id,
        credentialId: response.id,
      });
      verified = await verifyWebAuthnAuthentication(
        user.id,
        response as AuthenticationResponseJSON,
        expectedChallenge,
        getWebAuthnConfig(request),
      );
      console.log("WebAuthn authenticate verify: Verification successful", {
        userId: user.id,
        credentialId: verified.credentialID,
      });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("WebAuthn authenticate verify: Verification failed", {
        userId: user.id,
        error: errorMsg,
      });
      // Generic message to the client - the underlying library error is
      // logged above for debugging but shouldn't reach the response.
      const errorResponse = NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 },
      );
      errorResponse.cookies.set("webauthn_auth_challenge", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 0,
        path: "/",
      });
      return errorResponse;
    }

    if (!verified.verified) {
      console.error(
        "WebAuthn authenticate verify: Verification returned false",
        { userId: user.id },
      );
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 },
      );
    }

    // Spend the challenge: one challenge buys one sign-in. The unique token
    // column makes this atomic, so a replay or a parallel request with the
    // same challenge fails here.
    try {
      await prisma.tokenBlacklist.create({
        data: {
          token: challengeToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Authentication failed" },
          { status: 401 },
        );
      }
      throw error;
    }

    await clearAuthRateLimitForEmail("webauthn_authenticate", email);

    // Update counter to latest value (for cloning detection on next auth)
    await prisma.webAuthnCredential.update({
      where: { id: verified.credentialID },
      data: {
        counter: verified.newCounter,
        lastUsedAt: new Date(),
      },
    });

    // Log activity
    await prisma.userActivity.create({
      data: {
        userId: user.id,
        type: "LOGIN_WEBAUTHN",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    // NOTE: Passkey (WebAuthn) logins are considered a strong authentication
    // method. Do NOT require separate 2FA when authentication succeeds
    // via a verified assertion.

    // Generate tokens
    // A verified passkey is itself a second factor (see NOTE above).
    const { accessToken, refreshToken } = await generateTokens(
      user.id,
      user.role,
      { mfa: true },
    );

    // Create session
    const userSession = await prisma.userSession.create({
      data: {
        userId: user.id,
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    // N-9: same cookies and redirect as every other login route. This used
    // to set "refreshToken" (the app reads "refresh_token"), so passkey
    // sessions couldn't refresh and ended after an hour, and it sent admins
    // to /manage/dashboard and franchisees to the client dashboard.
    const response_obj = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        redirectUrl: redirectPathForRole(user.role),
        sessionId: userSession.id,
      },
      { status: 200 },
    );
    setSessionCookies(response_obj, accessToken, refreshToken);

    response_obj.cookies.set("webauthn_auth_challenge", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 0,
      path: "/",
    });

    return response_obj;
  } catch (error) {
    console.error("WebAuthn authentication verification error:", error);
    return NextResponse.json(
      { error: "Authentication verification failed" },
      { status: 500 },
    );
  }
}
