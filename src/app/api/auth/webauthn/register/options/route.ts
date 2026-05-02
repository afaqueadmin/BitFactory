import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { generateWebAuthnRegistrationOptions } from "@/lib/webauthn/server";

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
 * POST /api/auth/webauthn/register/options
 * Get registration options for passkey setup
 * User must be authenticated (have valid JWT)
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      console.error("WebAuthn register options: No token found in cookies");
      return NextResponse.json(
        { error: "Unauthorized - no token" },
        { status: 401 },
      );
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (tokenError) {
      console.error(
        "WebAuthn register options: Token verification failed",
        tokenError,
      );
      return NextResponse.json(
        { error: "Unauthorized - invalid token" },
        { status: 401 },
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      console.error("WebAuthn register options: User not found", { userId });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Generate registration options
    const webAuthnConfig = getWebAuthnConfig(request);
    const options = await generateWebAuthnRegistrationOptions(
      user,
      webAuthnConfig,
    );

    console.log("WebAuthn registration options generated successfully", {
      userId: user.id,
      rpId: webAuthnConfig.rpId,
      origin: webAuthnConfig.origin,
    });

    const response = NextResponse.json(options, { status: 200 });

    response.cookies.set("webauthn_reg_challenge", options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 10 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("WebAuthn registration options error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate registration options",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
