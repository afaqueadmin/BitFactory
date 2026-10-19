import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";

/**
 * GET /api/simulated-accounts  (ADMIN / SUPER_ADMIN)
 *
 * Every demo (SIMULATED) account with the contact details given at signup
 * and its last login - the marketing lead list.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let actorId: string;
    try {
      actorId = (await verifyJwtToken(token)).userId;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Role from the database, not the token.
    const actor = await prisma.user.findFirst({
      where: { id: actorId, isDeleted: false },
      select: { role: true },
    });
    if (actor?.role !== "ADMIN" && actor?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can view demo accounts" },
        { status: 403 },
      );
    }

    const users = await prisma.user.findMany({
      where: { role: "SIMULATED", isDeleted: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        createdAt: true,
      },
    });

    const lastLogins = users.length
      ? await prisma.userSession.groupBy({
          by: ["userId"],
          where: { userId: { in: users.map((u) => u.id) } },
          _max: { loginAt: true },
        })
      : [];
    const lastLoginById = new Map(
      lastLogins.map((l) => [l.userId, l._max.loginAt]),
    );

    return NextResponse.json({
      success: true,
      data: users.map((u) => ({
        ...u,
        lastLoginAt: lastLoginById.get(u.id) ?? null,
      })),
    });
  } catch (error) {
    console.error("[Simulated Accounts API] Error:", error);
    return NextResponse.json(
      { error: "Failed to load demo accounts" },
      { status: 500 },
    );
  }
}
