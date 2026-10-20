import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * The admin check for the simulated-account management routes: token
 * cookie, then an active ADMIN or SUPER_ADMIN read from the database (not
 * the token). Returns the caller's id, or a ready 401/403 response.
 */
export async function requireSimAdmin(
  request: NextRequest,
): Promise<{ actorId: string } | { response: NextResponse }> {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let actorId: string;
  try {
    actorId = (await verifyJwtToken(token)).userId;
  } catch {
    return {
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }

  const actor = await prisma.user.findFirst({
    where: { id: actorId, isDeleted: false },
    select: { role: true },
  });
  if (actor?.role !== "ADMIN" && actor?.role !== "SUPER_ADMIN") {
    return {
      response: NextResponse.json(
        { error: "Only administrators can manage simulated accounts" },
        { status: 403 },
      ),
    };
  }
  return { actorId };
}
