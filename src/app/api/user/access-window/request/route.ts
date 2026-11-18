/**
 * POST /api/user/access-window/request   { minutes, note? }
 *
 * A person on an office-hours schedule asks for more time ("Request more
 * time" on the banner). Super admins see it on the Access Rules page and by
 * email, and approve or decline it there. One pending request at a time.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  loadStaffAccess,
  notifySuperAdmins,
} from "@/lib/auth/staffAccessServer";

export const runtime = "nodejs";

const MIN_MINUTES = 5;
const MAX_MINUTES = 240;

export async function POST(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let userId: string;
  try {
    userId = (await verifyJwtToken(token)).userId;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { role: true, email: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const snapshot = await loadStaffAccess(userId, user.role);
    if (!snapshot?.hoursEnabled) {
      return NextResponse.json(
        { error: "Your account has no working-hours limit" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const minutes = Number(body.minutes);
    if (
      !Number.isInteger(minutes) ||
      minutes < MIN_MINUTES ||
      minutes > MAX_MINUTES
    ) {
      return NextResponse.json(
        { error: `Ask for between ${MIN_MINUTES} and ${MAX_MINUTES} minutes` },
        { status: 400 },
      );
    }
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 500)
        : null;

    const pending = await prisma.staffTimeRequest.findFirst({
      where: { userId, status: "PENDING" },
      select: { id: true },
    });
    if (pending) {
      return NextResponse.json(
        { error: "You already have a request waiting for a super admin" },
        { status: 409 },
      );
    }

    const created = await prisma.staffTimeRequest.create({
      data: { userId, minutesRequested: minutes, note },
      select: { id: true, minutesRequested: true, createdAt: true },
    });

    await prisma.userActivity.create({
      data: {
        userId,
        type: "ACCESS_TIME_REQUESTED",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    const who = user.name ? `${user.name} (${user.email})` : user.email;
    notifySuperAdmins(
      {
        subject: "Staff Request: More Working Time",
        heading: "A staff member asks for more time",
        message: `${who} asks for ${minutes} more minutes of access${
          note ? `: "${note}"` : ""
        }. Approve or decline it on the Access Rules page.`,
      },
      request.headers,
    );

    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    console.error("Access time request error:", error);
    return NextResponse.json(
      { error: "Failed to send your request" },
      { status: 500 },
    );
  }
}
