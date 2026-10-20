import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  SIM_REQUEST_ACTIVITY,
  simConversionBlocker,
  simulationRequestStatus,
} from "@/lib/simulation/convert";

export const runtime = "nodejs";

/**
 * A Potential Customer asking for a simulated account.
 *
 * GET  -> { eligible, status: "none" | "pending" | "declined" }
 * POST -> files the request (a UserActivity row; no table of its own). Admins
 *         see it on the Simulated Accounts page and approve (convert this
 *         same account) or decline.
 *
 * Eligible = an active direct CLIENT of type Potential Customer that could
 * actually be converted (no miners, subaccounts, invoices or payments).
 */

async function authenticate(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return null;
  try {
    return await verifyJwtToken(token);
  } catch {
    return null;
  }
}

async function isEligible(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, segment: true, isDeleted: true },
  });
  if (
    !user ||
    user.isDeleted ||
    user.role !== "CLIENT" ||
    user.segment !== "POTENTIAL_CUSTOMER"
  ) {
    return false;
  }
  return (await simConversionBlocker(userId)) === null;
}

export async function GET(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (decoded.role !== "CLIENT") {
      return NextResponse.json({ eligible: false, status: "none" });
    }
    const [eligible, status] = await Promise.all([
      isEligible(decoded.userId),
      simulationRequestStatus(decoded.userId),
    ]);
    return NextResponse.json({ eligible, status });
  } catch (error) {
    console.error("[Simulation Request API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load request status" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await authenticate(request);
    if (!decoded) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (decoded.role !== "CLIENT" || !(await isEligible(decoded.userId))) {
      return NextResponse.json(
        { error: "Your account can't request a simulated account" },
        { status: 403 },
      );
    }
    if ((await simulationRequestStatus(decoded.userId)) === "pending") {
      return NextResponse.json({
        message: "Your request has already been sent",
        status: "pending",
      });
    }

    await prisma.userActivity.create({
      data: {
        userId: decoded.userId,
        loginId: decoded.loginId ?? null,
        type: SIM_REQUEST_ACTIVITY,
        ipAddress:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({
      message:
        "Request sent. We'll email you as soon as your simulated account is ready.",
      status: "pending",
    });
  } catch (error) {
    console.error("[Simulation Request API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to send your request" },
      { status: 500 },
    );
  }
}
