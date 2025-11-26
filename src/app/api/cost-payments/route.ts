import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can add payments" },
        { status: 403 },
      );
    }

    const { userId: customerId, amount, type } = await request.json();

    // Validate input
    if (!customerId || amount === undefined || !type) {
      return NextResponse.json(
        { error: "customerId, amount, and type are required" },
        { status: 400 },
      );
    }

    if (typeof amount !== "number" || amount === 0) {
      return NextResponse.json(
        { error: "Amount must be a non-zero number" },
        { status: 400 },
      );
    }

    // Verify the customer exists
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Create cost payment entry
    const costPayment = await prisma.costPayment.create({
      data: {
        userId: customerId,
        amount,
        type,
        consumption: 0,
      },
    });

    return NextResponse.json(
      {
        message: "Payment added successfully",
        payment: costPayment,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error adding payment:", error);
    return NextResponse.json(
      { error: "Failed to add payment" },
      { status: 500 },
    );
  }
}
