import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

// Add runtime config for Node.js runtime
export const runtime = "nodejs";

/**
 * Blacklists one of this device's tokens. Returns its user, or null if the
 * token was already unusable (expired, revoked or invalid).
 */
async function revokeToken(token: string): Promise<string | null> {
  let decoded;
  try {
    decoded = await verifyJwtToken(token);
  } catch {
    return null;
  }
  try {
    // expiresAt only controls when this row is safe to purge - it must be at
    // least the token's own remaining lifetime, or the blacklist entry could
    // expire (and the check in verifyJwtToken stop rejecting it) before the
    // token itself does. Falls back to the longest token lifetime issued
    // (refresh, 7d) if exp is somehow missing.
    const expiresAt = decoded.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.tokenBlacklist.create({
      data: { token, userId: decoded.userId, expiresAt },
    });
    console.log(`[Auth Signout] Token blacklisted for user: ${decoded.userId}`);
  } catch (error) {
    // e.g. a parallel logout blacklisted it first. Never fail the logout.
    console.error(
      `[Auth Signout] Error blacklisting token for user ${decoded.userId}:`,
      error,
    );
  }
  return decoded.userId;
}

/**
 * Logs out this device only (N-2): both its access token and its 7-day
 * refresh token are revoked, so a copied cookie stops working too. Other
 * devices stay signed in - signing out everywhere is
 * src/lib/auth/sessionRevocation.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    const refreshToken = request.cookies.get("refresh_token")?.value;

    // The refresh token is revoked even when the access token has already
    // expired, which is the usual state after an hour idle.
    let userId: string | null = null;
    for (const t of [token, refreshToken]) {
      if (!t) continue;
      const owner = await revokeToken(t);
      userId ??= owner;
    }

    if (userId) {
      try {
        // Log logout activity
        await prisma.userActivity.create({
          data: {
            userId,
            type: "LOGOUT",
            ipAddress:
              request.headers.get("x-forwarded-for") ||
              request.headers.get("x-real-ip") ||
              "unknown",
            userAgent: request.headers.get("user-agent") || "unknown",
          },
        });

        // Close the most recent open session and record duration
        const openSession = await prisma.userSession.findFirst({
          where: { userId, logoutAt: null },
          orderBy: { loginAt: "desc" },
        });
        if (openSession) {
          const logoutAt = new Date();
          const duration = Math.floor(
            (logoutAt.getTime() - openSession.loginAt.getTime()) / 1000,
          );
          await prisma.userSession.update({
            where: { id: openSession.id },
            data: { logoutAt, duration },
          });
        }
      } catch (e) {
        console.error("Failed to record logout activity/session:", e);
      }
    }

    // Create a response that will clear the cookies
    const response = NextResponse.json(
      { message: "Logged out successfully" },
      { status: 200 },
    );

    // Clear the auth cookies
    response.cookies.set("token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: new Date(0), // Immediately expire the cookie
    });

    response.cookies.set("refresh_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: new Date(0), // Immediately expire the cookie
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
