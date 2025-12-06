import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware ID is required" },
        { status: 400 }
      );
    }

    const hardware = await prisma.hardware.findUnique({
      where: { id },
    });

    if (!hardware) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware not found" },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      data: hardware,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching hardware:", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to fetch hardware" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify token and check if admin
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware ID is required" },
        { status: 400 }
      );
    }

    // Check if hardware exists
    const existingHardware = await prisma.hardware.findUnique({
      where: { id },
    });

    if (!existingHardware) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { model, powerUsage, hashRate } = body;

    // Validate fields if provided
    if (model !== undefined && model.trim() === "") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Model cannot be empty" },
        { status: 400 }
      );
    }

    if (powerUsage !== undefined) {
      if (typeof powerUsage !== "number" || powerUsage <= 0) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "Power usage must be a positive number (in kW)" },
          { status: 400 }
        );
      }
    }

    if (hashRate !== undefined) {
      if (typeof hashRate !== "number" || hashRate <= 0) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "Hash rate must be a positive number (in TH/s)" },
          { status: 400 }
        );
      }
    }

    // Check if new model name already exists (if model is being changed)
    if (model && model !== existingHardware.model) {
      const duplicateModel = await prisma.hardware.findUnique({
        where: { model },
      });

      if (duplicateModel) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "Hardware model already exists" },
          { status: 400 }
        );
      }
    }

    // Update hardware
    const updatedHardware = await prisma.hardware.update({
      where: { id },
      data: {
        ...(model !== undefined && { model }),
        ...(powerUsage !== undefined && { powerUsage }),
        ...(hashRate !== undefined && { hashRate }),
      },
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: updatedHardware,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error updating hardware:", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to update hardware" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify token and check if admin
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware ID is required" },
        { status: 400 }
      );
    }

    // Check if hardware exists
    const existingHardware = await prisma.hardware.findUnique({
      where: { id },
      include: { miners: true },
    });

    if (!existingHardware) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware not found" },
        { status: 404 }
      );
    }

    // Check if hardware is in use by miners
    if (existingHardware.miners.length > 0) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: `Cannot delete hardware: ${existingHardware.miners.length} miner(s) still using this hardware`,
        },
        { status: 409 }
      );
    }

    // Delete hardware
    await prisma.hardware.delete({
      where: { id },
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error deleting hardware:", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to delete hardware" },
      { status: 500 }
    );
  }
}
