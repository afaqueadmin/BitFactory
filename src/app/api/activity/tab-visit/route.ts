import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    let body: { tabKey?: string; tabName?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { tabKey, tabName } = body;
    if (!tabKey || !tabName) {
      return NextResponse.json(
        { error: "tabKey and tabName are required" },
        { status: 400 },
      );
    }

    // Find the user's most recent open session; create one if none exists
    let session = await prisma.userSession.findFirst({
      where: { userId, logoutAt: null },
      orderBy: { loginAt: "desc" },
    });

    if (!session) {
      const ipAddress =
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown";
      const userAgent = request.headers.get("user-agent") || "unknown";
      session = await prisma.userSession.create({
        data: { userId, ipAddress, userAgent },
      });
    }

    await prisma.tabVisit.create({
      data: { sessionId: session.id, userId, tabKey, tabName },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tab visit error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
