/**
 * GET /api/user/access-window
 *
 * Staff access rules, the signed-in person's side: polled every 30 seconds by
 * the AccessWindowBanner. Returns how long they may keep working, any pending
 * request for more time, and the last time a super admin added.
 *
 * If their allowed time changed since the session token was issued (extra
 * time added, hours or holidays edited), this re-issues the session cookies
 * with the new end time - that is how added time reaches a live session
 * without signing in again.
 *
 * 204 = the account has no access rule.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTokens, verifyJwtToken } from "@/lib/jwt";
import { setSessionCookies } from "@/lib/auth/sessionCookies";
import { loadStaffAccess } from "@/lib/auth/staffAccessServer";
import { decideRestriction } from "@/lib/auth/staffAccess";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let decoded;
  try {
    decoded = await verifyJwtToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    // Role from the database, not the token.
    const user = await prisma.user.findFirst({
      where: { id: decoded.userId, isDeleted: false },
      select: { role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const snapshot = await loadStaffAccess(decoded.userId, user.role, now);
    if (!snapshot) return new NextResponse(null, { status: 204 });

    const [pendingRequest, lastGrant] = await Promise.all([
      prisma.staffTimeRequest.findFirst({
        where: { userId: decoded.userId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: { id: true, minutesRequested: true, createdAt: true },
      }),
      prisma.staffAccessWindow.findFirst({
        where: {
          userId: decoded.userId,
          kind: "EXTRA_TIME",
          createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, startsAt: true, endsAt: true, createdAt: true },
      }),
    ]);

    const decision = decideRestriction({
      access: snapshot.access,
      requireDeviceBoundPasskey: snapshot.requireDeviceBoundPasskey,
      passkeyExemptUntil: snapshot.passkeyExemptUntil,
      viaBuiltInPasskey: decoded.dbp === true,
      now,
    });
    const accessUntil = decision.ok
      ? (decision.claims.accessUntil ?? null)
      : null;

    const response = NextResponse.json({
      phase: decision.ok ? snapshot.access.phase : "closed",
      accessUntil: accessUntil
        ? new Date(accessUntil * 1000).toISOString()
        : null,
      scheduledEnd: snapshot.access.scheduledEnd?.toISOString() ?? null,
      graceEnd: snapshot.access.graceEnd?.toISOString() ?? null,
      graceMinutes: snapshot.graceMinutes,
      hoursEnabled: snapshot.hoursEnabled,
      pendingRequest,
      lastGrant: lastGrant
        ? {
            id: lastGrant.id,
            minutes: Math.round(
              (lastGrant.endsAt.getTime() - lastGrant.startsAt.getTime()) /
                60000,
            ),
            createdAt: lastGrant.createdAt.toISOString(),
            endsAt: lastGrant.endsAt.toISOString(),
          }
        : null,
      serverNow: now.toISOString(),
    });

    // No longer allowed (hours edited, a holiday added...): end the session
    // now; the banner sends the person to the login page.
    if (!decision.ok) {
      for (const name of ["token", "refresh_token"]) {
        response.cookies.set(name, "", { maxAge: 0, path: "/" });
      }
      return response;
    }
    // New end time since the token was issued: carry it into fresh cookies.
    if ((decision.claims.accessUntil ?? undefined) !== decoded.accessUntil) {
      const { accessToken, refreshToken } = await generateTokens(
        { userId: decoded.userId, loginId: decoded.loginId, role: user.role },
        { mfa: decoded.mfa === true, ...decision.claims },
      );
      setSessionCookies(response, accessToken, refreshToken);
    }
    return response;
  } catch (error) {
    console.error("Access window error:", error);
    return NextResponse.json(
      { error: "Failed to load your access time" },
      { status: 500 },
    );
  }
}
