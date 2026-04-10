import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    // You can add logic to block if not admin, but assuming users can view their own,
    // or block outright if not admin:
    if (
      decoded.role !== "ADMIN" &&
      decoded.role !== "SUPER_ADMIN" &&
      decoded.role !== "CLIENT"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id: minerId } = await params;
    if (!minerId) {
      return NextResponse.json(
        { error: "Miner ID is required" },
        { status: 400 },
      );
    }

    const repairNotes = await prisma.minerRepairNote.findMany({
      where: { minerId },
      orderBy: { dateOfEntry: "desc" },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: repairNotes },
      { status: 200 },
    );
  } catch (error) {
    console.error("Machine API [GET repair-notes] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    // Only Admin can add repair notes
    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id: minerId } = await params;
    if (!minerId) {
      return NextResponse.json(
        { error: "Miner ID is required" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { note, dateOfEntry } = body;

    if (!note) {
      return NextResponse.json(
        { error: "Note content is required" },
        { status: 400 },
      );
    }

    const repairNote = await prisma.minerRepairNote.create({
      data: {
        miner: { connect: { id: minerId } },
        note,
        dateOfEntry: dateOfEntry ? new Date(dateOfEntry) : new Date(),
        createdBy: { connect: { id: decoded.userId as string } },
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: repairNote },
      { status: 201 },
    );
  } catch (error) {
    console.error("Machine API [POST repair-notes] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
