import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { verifyWebAuthnRegistration } from "@/lib/webauthn/server";
import { WebAuthnAttestationResponse } from "@/types/webauthn";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";

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
 * POST /api/auth/webauthn/register/verify
 * Verify attestation response and store credential
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      console.warn("WebAuthn register verify: No token in cookies");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (tokenError) {
      console.error(
        "WebAuthn register verify: Token verification failed",
        tokenError,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const response: WebAuthnAttestationResponse = body;

    console.log("WebAuthn register verify: Received request body", {
      hasId: !!body.id,
      hasRawId: !!body.rawId,
      hasResponse: !!body.response,
      hasClientDataJSON: !!body.response?.clientDataJSON,
      hasAttestationObject: !!body.response?.attestationObject,
      credentialName: body.credentialName,
      type: body.type,
    });

    if (!response || !response.id) {
      console.warn("WebAuthn register verify: Invalid attestation response", {
        body,
      });
      return NextResponse.json(
        { error: "Invalid attestation response" },
        { status: 400 },
      );
    }

    // Get user for verification
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      console.error("WebAuthn register verify: User not found", { userId });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const expectedChallenge = request.cookies.get(
      "webauthn_reg_challenge",
    )?.value;

    if (!expectedChallenge) {
      console.warn(
        "WebAuthn register verify: No registration challenge cookie",
        { userId },
      );
      return NextResponse.json(
        { error: "Challenge not found or expired" },
        { status: 400 },
      );
    }

    // Verify the attestation
    let verified;
    try {
      console.log("WebAuthn register verify: Starting verification", {
        userId,
        credentialId: response.id,
      });
      verified = await verifyWebAuthnRegistration(
        user,
        response as RegistrationResponseJSON,
        expectedChallenge,
        getWebAuthnConfig(request),
      );
      console.log("WebAuthn register verify: Verification successful", {
        credentialIDLength: verified.credentialID?.length,
        counter: verified.counter,
      });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("WebAuthn register verify: Verification failed", {
        error: errorMsg,
      });
      const errorResponse = NextResponse.json(
        { error: errorMsg || "Attestation verification failed" },
        { status: 400 },
      );
      errorResponse.cookies.set("webauthn_reg_challenge", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 0,
        path: "/",
      });
      return errorResponse;
    }

    // Store credential in database
    let credential;
    try {
      console.log("WebAuthn register verify: Creating credential with data", {
        userId,
        credentialIdType: typeof verified.credentialID,
        credentialIdLength: verified.credentialID?.length,
        publicKeyType: typeof verified.credentialPublicKey,
        publicKeyLength: verified.credentialPublicKey?.length,
        counter: verified.counter,
        transports: body.transports,
        credentialName: body.credentialName,
      });

      credential = await prisma.webAuthnCredential.create({
        data: {
          userId,
          credentialId: Buffer.from(verified.credentialID),
          publicKey: Buffer.from(verified.credentialPublicKey),
          counter: verified.counter,
          transports: body.transports || [],
          credentialName: body.credentialName || "My Passkey",
        },
      });

      console.log("WebAuthn register verify: Credential stored successfully", {
        credentialId: credential.id,
        storedCredentialIdLength: credential.credentialId.length,
      });

      // Log activity
      await prisma.userActivity.create({
        data: {
          userId,
          type: "WEBAUTHN_REGISTERED",
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
        },
      });

      console.log("WebAuthn register verify: Activity logged");

      const successResponse = NextResponse.json(
        {
          success: true,
          credentialId: credential.id,
          credentialName: credential.credentialName,
        },
        { status: 201 },
      );
      successResponse.cookies.set("webauthn_reg_challenge", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 0,
        path: "/",
      });
      return successResponse;
    } catch (dbError: unknown) {
      const errorMsg =
        dbError instanceof Error ? dbError.message : "Unknown database error";
      console.error("WebAuthn register verify: Database error", {
        message: errorMsg,
      });
      const errorResponse = NextResponse.json(
        { error: "Failed to store credential: " + errorMsg },
        { status: 500 },
      );
      errorResponse.cookies.set("webauthn_reg_challenge", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 0,
        path: "/",
      });
      return errorResponse;
    }
  } catch (error) {
    console.error("WebAuthn registration verification error:", error);
    return NextResponse.json(
      {
        error: "Registration verification failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
