import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken, generateTokens } from "@/lib/jwt";

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
      }
    }

    // If access token is invalid or expired, try refresh token
    if (refreshToken) {
      try {
        const decoded = await verifyJwtToken(refreshToken);
        if (decoded && decoded.type === "refresh") {
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
            // Generate new tokens
            const { accessToken, refreshToken: newRefreshToken } =
              await generateTokens(user.id, user.role);

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
