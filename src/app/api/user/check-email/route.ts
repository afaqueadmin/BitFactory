import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { isEmailTaken } from "@/lib/auth/emailIdentity";

/**
 * GET /api/user/check-email?email=test@example.com
 * Check if an email is already registered in the database.
 * ADMIN/SUPER_ADMIN/ACCOUNTING only - it backs the admin create-user and
 * create-franchisee forms, and left public it would let anyone probe which
 * emails have accounts.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, [
      "customers.view",
      "customers.create",
      "customers.edit",
      "franchisees.create",
      "franchisees.edit",
    ]);
    if ("response" in auth) return auth.response;

    const email = request.nextUrl.searchParams.get("email");

    console.log(`[Check Email API] Checking email: ${email}`);

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { exists: false, message: "Invalid email format" },
        { status: 200 },
      );
    }

    if (await isEmailTaken(email)) {
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
