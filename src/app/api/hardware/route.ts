import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}

export async function GET() {
  try {
    const hardware = await prisma.hardware.findMany({
      include: {
        procurementHistory: {
          select: {
            id: true,
            quantity: true,
            createdAt: true,
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: hardware,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching hardware:", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to fetch hardware" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 },
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
        { status: 401 },
      );
    }

    // Check if user is admin or super admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Admin access required" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { model, powerUsage, hashRate, quantity } = body;

    // Validation
    if (!model || model.trim() === "") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Model is required" },
        { status: 400 },
      );
    }

    if (powerUsage === undefined || powerUsage === null) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Power usage is required" },
        { status: 400 },
      );
    }

    if (typeof powerUsage !== "number" || powerUsage <= 0) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Power usage must be a positive number (in kW)",
        },
        { status: 400 },
      );
    }

    if (hashRate === undefined || hashRate === null) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hash rate is required" },
        { status: 400 },
      );
    }

    if (typeof hashRate !== "number" || hashRate <= 0) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "Hash rate must be a positive number (in TH/s)",
        },
        { status: 400 },
      );
    }

    if (quantity !== undefined) {
      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: "Quantity must be a positive integer" },
          { status: 400 },
        );
      }
    }

    // Check if hardware model already exists
    const existingHardware = await prisma.hardware.findUnique({
      where: { model },
    });

    if (existingHardware) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Hardware model already exists" },
        { status: 400 },
      );
    }

    // Create hardware
    const hardware = await prisma.hardware.create({
      data: {
        model,
        powerUsage,
        hashRate,
        ...(quantity !== undefined && { quantity }),
      },
    });

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: hardware,
        timestamp: new Date().toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating hardware:", error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Failed to create hardware" },
      { status: 500 },
    );
  }
}
