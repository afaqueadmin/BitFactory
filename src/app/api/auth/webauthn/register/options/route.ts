import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { generateWebAuthnRegistrationOptions } from "@/lib/webauthn/server";

export const runtime = "nodejs";

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
      return NextResponse.json({ error: "Unauthorized - no token" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (tokenError) {
      console.error("WebAuthn register options: Token verification failed", tokenError);
      return NextResponse.json({ error: "Unauthorized - invalid token" }, { status: 401 });
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
    const options = await generateWebAuthnRegistrationOptions(user);
    
    console.log("WebAuthn registration options generated successfully", {
      userId: user.id,
      rpId: process.env.WEBAUTHN_RP_ID || "localhost",
      origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
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
      { error: "Failed to generate registration options", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
