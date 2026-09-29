/**
 * POST /api/auth/2fa/enroll/setup
 *
 * Forced 2FA setup at login (M-1), step 1: returns a new secret + QR code.
 * Authenticated only by the enrollment cookie that /api/login issues after a
 * correct password once 2FA is enforced - not by a session.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEnrollmentToken } from "@/lib/jwt";
import { ENROLLMENT_COOKIE } from "@/lib/auth/sessionCookies";
import { beginTwoFactorSetup } from "@/lib/auth/twoFactorEnrollment";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(ENROLLMENT_COOKIE)?.value;
    if (!token) {
      return NextResponse.json(
        { error: "Your setup session has expired. Please log in again." },
        { status: 401 },
      );
    }

    let userId: string;
    try {
      ({ userId } = await verifyEnrollmentToken(token));
    } catch {
      return NextResponse.json(
        { error: "Your setup session has expired. Please log in again." },
        { status: 401 },
      );
    }

    // Enrollment is only for accounts without 2FA - it must not become a way
    // to replace an existing authenticator.
    const existing = await prisma.twoFactorAuth.findUnique({
      where: { userId },
      select: { enabled: true },
    });
    if (existing?.enabled) {
      return NextResponse.json(
        {
          error: "Two-factor authentication is already set up. Please log in.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(await beginTwoFactorSetup(userId));
  } catch (error) {
    console.error("2FA enroll setup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
