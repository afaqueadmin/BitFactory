import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateWebAuthnAuthenticationOptions } from "@/lib/webauthn/server";

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
 * POST /api/auth/webauthn/authenticate/options
 * Get authentication options for passkey login
 * Email required, no auth needed (public endpoint)
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        webauthnCredentials: {
          select: { credentialId: true },
        },
      },
    });

    if (!user) {
      const webAuthnConfig = getWebAuthnConfig(request);
      // Don't reveal if user exists, but still provide options
      // (allows for user enumeration attack mitigation - return empty options)
      return NextResponse.json(
        {
          publicKey: {
            challenge: await generateRandomChallenge(),
            timeout: 60000,
            rpId: webAuthnConfig.rpId,
            userVerification: "preferred",
            allowCredentials: [],
          },
        },
        { status: 200 },
      );
    }

    // User has credentials, generate authentication options
    const webAuthnConfig = getWebAuthnConfig(request);
    const options = await generateWebAuthnAuthenticationOptions(
      email,
      webAuthnConfig,
    );

    const response = NextResponse.json(options, { status: 200 });

    response.cookies.set("webauthn_auth_challenge", options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 5 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("WebAuthn authentication options error:", error);
    return NextResponse.json(
      { error: "Failed to generate authentication options" },
      { status: 500 },
    );
  }
}

async function generateRandomChallenge(): Promise<string> {
  const buffer = Buffer.alloc(32);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer.toString("base64url");
}
