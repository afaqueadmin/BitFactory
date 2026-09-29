import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken, generateTokens } from "@/lib/jwt";
import { twoFactorRequirement } from "@/lib/auth/twoFactorPolicy";

// Runtime config
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("token")?.value;
    const refreshToken = request.cookies.get("refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.json({ isAuthenticated: false }, { status: 401 });
    }

    // Try to verify the access token first
    if (accessToken) {
      try {
        const decoded = await verifyJwtToken(accessToken);
        // Get user data
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        });

        if (user) {
          return NextResponse.json({
            isAuthenticated: true,
            user,
          });
        }
      } catch (error) {
        console.error("Access token verification failed:", error);
        // Fall through to refresh token check
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        // Do not fall through to refresh token if access token is invalid, just return 401
      }
    }

    // If access token is invalid or expired, try refresh token
    if (refreshToken) {
      try {
        const decoded = await verifyJwtToken(refreshToken);
        if (decoded && decoded.type === "refresh") {
          // Get user data - excludes soft-deleted accounts so a deleted
          // user can't keep refreshing into new token pairs indefinitely.
          const found = await prisma.user.findFirst({
            where: { id: decoded.userId, isDeleted: false },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              twoFactorAuth: { select: { enabled: true } },
            },
          });

          // M-1: once 2FA is enforced, a password-only session of an account
          // still without 2FA isn't extended - the next login goes through
          // forced setup. Sessions from a 2FA code or passkey (mfa) are fine.
          const blockedByTwoFactorPolicy =
            !!found &&
            decoded.mfa !== true &&
            twoFactorRequirement(
              found.role,
              found.twoFactorAuth?.enabled ?? false,
            ) === "enforced";

          if (found && !blockedByTwoFactorPolicy) {
            const user = {
              id: found.id,
              email: found.email,
              name: found.name,
              role: found.role,
            };
            // Generate new tokens, keeping how the session was established.
            const { accessToken, refreshToken: newRefreshToken } =
              await generateTokens(user.id, user.role, {
                mfa: decoded.mfa === true,
              });

            // Create response with new tokens
            const response = NextResponse.json({
              isAuthenticated: true,
              user,
            });

            // Set new cookies
            response.cookies.set("token", accessToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "strict",
              maxAge: 60 * 60, // 1 hour
              path: "/",
            });

            response.cookies.set("refresh_token", newRefreshToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === "production",
              sameSite: "strict",
              maxAge: 7 * 24 * 60 * 60, // 7 days
              path: "/",
            });

            return response;
          }
        }
      } catch (error) {
        console.error("Refresh token verification failed:", error);
        // Fall through to clear cookies
      }
    }

    // If both tokens are invalid
    const response = NextResponse.json(
      { isAuthenticated: false },
      { status: 401 },
    );

    // Clear invalid cookies
    ["token", "refresh_token"].forEach((cookieName) => {
      response.cookies.set(cookieName, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 0,
        path: "/",
        expires: new Date(0),
      });
    });

    return response;
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
