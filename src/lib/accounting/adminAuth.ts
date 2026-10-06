import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * Same check as the existing accounting routes (token cookie, then role
 * ADMIN or SUPER_ADMIN), shared by the payment-account and upload routes.
 * Returns the caller's userId, or a ready 401/403 response.
 */
export async function requireAccountingAdmin(
  request: NextRequest,
): Promise<{ userId: string } | { response: NextResponse }> {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let userId: string;
  try {
    ({ userId } = await verifyJwtToken(token));
  } catch {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
    return {
      response: NextResponse.json(
        { error: "Only administrators can manage accounting records" },
        { status: 403 },
      ),
    };
  }

  return { userId };
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function isNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
