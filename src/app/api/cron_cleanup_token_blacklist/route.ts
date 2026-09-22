/**
 * GET /api/cron_cleanup_token_blacklist
 *
 * Deletes TokenBlacklist rows past their expiresAt. Nothing else in the app
 * ever deletes from this table (see src/app/api/user/[id]/route.ts, where the
 * one other reference is commented out) - a row is written on every logout,
 * so without this the table grows forever.
 *
 * Safe to run at any time: isTokenBlacklisted() in
 * src/lib/auth/tokenBlacklist.ts checks row existence only, never expiresAt,
 * and expiresAt is set from the token's own exp claim (see
 * src/app/api/auth/signout/route.ts) - so a row is never eligible for
 * deletion here before the token it revoked would have expired on its own
 * anyway.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { count } = await prisma.tokenBlacklist.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    console.log(`[Cron] Purged ${count} expired token_blacklist row(s)`);

    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    console.error("[Cron] Failed to purge token_blacklist:", error);
    return NextResponse.json(
      { success: false, error: "Failed to purge expired token blacklist rows" },
      { status: 500 },
    );
  }
}
