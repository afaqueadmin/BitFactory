/** Session checks shared by the guild API routes. */

import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken, type JwtPayload } from "@/lib/jwt";
import { isStaffRole } from "@/lib/auth/staffRoles";

type AuthResult = { decoded: JwtPayload } | { error: NextResponse };

const fail = (error: string, status: number): AuthResult => ({
  error: NextResponse.json({ success: false, error }, { status }),
});

/** Any signed-in account. */
export async function requireSession(
  request: NextRequest,
): Promise<AuthResult> {
  const token = request.cookies.get("token")?.value;
  if (!token) return fail("Unauthorized", 401);
  try {
    return { decoded: await verifyJwtToken(token) };
  } catch {
    return fail("Invalid token", 401);
  }
}

/** ADMIN, SUPER_ADMIN or ACCOUNTING. */
export async function requireStaff(request: NextRequest): Promise<AuthResult> {
  const auth = await requireSession(request);
  if ("error" in auth) return auth;
  if (!isStaffRole(auth.decoded.role))
    return fail("Admin access required", 403);
  return auth;
}

/** A JSON error response in the guild routes' shape. */
export const jsonError = (error: string, status = 400) =>
  NextResponse.json({ success: false, error }, { status });
