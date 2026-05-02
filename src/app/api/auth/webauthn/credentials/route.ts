import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";

/**
 * GET /api/auth/webauthn/credentials
 * List all credentials for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId },
      select: {
        id: true,
        credentialName: true,
        createdAt: true,
        lastUsedAt: true,
        transports: true,
        aaguid: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ credentials }, { status: 200 });
  } catch (error) {
    console.error("WebAuthn credentials list error:", error);
    return NextResponse.json(
      { error: "Failed to list credentials" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/webauthn/credentials?id=credentialId
 * Delete a credential
 */
export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get("id");

    if (!credentialId) {
      return NextResponse.json(
        { error: "Credential ID is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const credential = await prisma.webAuthnCredential.findUnique({
      where: { id: credentialId },
      select: { userId: true },
    });

    if (!credential || credential.userId !== userId) {
      return NextResponse.json(
        { error: "Credential not found or unauthorized" },
        { status: 403 }
      );
    }

    // Ensure user has at least one other auth method
    const credentialCount = await prisma.webAuthnCredential.count({
      where: { userId },
    });

    if (credentialCount === 1) {
      // Check if user has password auth enabled
      const hasPassword = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true },
      });

      if (!hasPassword?.password) {
        return NextResponse.json(
          { error: "Cannot delete last authentication method" },
          { status: 400 }
        );
      }
    }

    // Delete credential
    await prisma.webAuthnCredential.delete({
      where: { id: credentialId },
    });

    // Log activity
    await prisma.userActivity.create({
      data: {
        userId,
        type: "WEBAUTHN_DELETED",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("WebAuthn credential delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete credential" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/auth/webauthn/credentials
 * Rename a credential
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { credentialId, credentialName } = await request.json();

    if (!credentialId || !credentialName || typeof credentialName !== "string") {
      return NextResponse.json(
        { error: "Credential ID and name are required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const credential = await prisma.webAuthnCredential.findUnique({
      where: { id: credentialId },
      select: { userId: true },
    });

    if (!credential || credential.userId !== userId) {
      return NextResponse.json(
        { error: "Credential not found or unauthorized" },
        { status: 403 }
      );
    }

    // Update credential name
    const updated = await prisma.webAuthnCredential.update({
      where: { id: credentialId },
      data: { credentialName: credentialName.trim() },
      select: {
        id: true,
        credentialName: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("WebAuthn credential rename error:", error);
    return NextResponse.json(
      { error: "Failed to update credential" },
      { status: 500 }
    );
  }
}
