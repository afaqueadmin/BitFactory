import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/user/check-email?email=test@example.com
 * Check if an email is already registered in the database
 * No authentication required (used during user creation flow)
 */
export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get("email");

    console.log(`[Check Email API] Checking email: ${email}`);

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { exists: false, message: "Invalid email format" },
        { status: 200 },
      );
    }

    // Check if user with this email exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (existingUser) {
      console.log(`[Check Email API] Email found in database: ${email}`);
      return NextResponse.json({ exists: true }, { status: 200 });
    }

    console.log(`[Check Email API] Email is available: ${email}`);
    return NextResponse.json({ exists: false }, { status: 200 });
  } catch (error) {
    console.error("[Check Email API] Error checking email:", error);
    return NextResponse.json(
      { exists: false, error: "Failed to check email" },
      { status: 500 },
    );
  }
}
