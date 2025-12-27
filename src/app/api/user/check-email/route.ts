import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import normalizeEmailUsername from "@/lib/helpers/normailizeEmailUsername";

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

    // Find all users and match by normalizing their stored email usernames
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true },
    });

    // Find user by comparing normalized email usernames
    const normalizedUsername = normalizeEmailUsername(email);
    const existingUser = allUsers.find(
      (u) => normalizeEmailUsername(u.email) === normalizedUsername,
    );

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
