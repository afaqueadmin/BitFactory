import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    // Only Admin can delete repair notes
    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { noteId } = await params;
    if (!noteId) {
      return NextResponse.json(
        { error: "Note ID is required" },
        { status: 400 },
      );
    }

    const existingNote = await prisma.minerRepairNote.findUnique({
      where: { id: noteId },
      select: { minerId: true },
    });

    if (!existingNote) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    await prisma.minerRepairNote.delete({
      where: { id: noteId },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.MINER_REPAIR_NOTE_DELETED,
        entityType: "Miner",
        entityId: existingNote.minerId,
        userId: decoded.userId as string,
        description: "Repair note deleted",
      },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Machine API [DELETE repair-note] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    // Only Admin can edit repair notes
    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { noteId } = await params;
    if (!noteId) {
      return NextResponse.json(
        { error: "Note ID is required" },
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

    const updatedNote = await prisma.minerRepairNote.update({
      where: { id: noteId },
      data: {
        note,
        dateOfEntry: dateOfEntry ? new Date(dateOfEntry) : new Date(),
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

    await prisma.auditLog.create({
      data: {
        action: AuditAction.MINER_REPAIR_NOTE_UPDATED,
        entityType: "Miner",
        entityId: updatedNote.minerId,
        userId: decoded.userId as string,
        description: "Repair note updated",
      },
    });

    return NextResponse.json(
      { success: true, data: updatedNote },
      { status: 200 },
    );
  } catch (error) {
    console.error("Machine API [PUT repair-note] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
