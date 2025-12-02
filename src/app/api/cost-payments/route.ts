import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and extract user ID
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("[Cost Payments GET] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get pagination parameters from query string
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "0", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "10", 10);

    // Validate pagination parameters
    if (page < 0 || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400 },
      );
    }

    console.log(
      `[Cost Payments GET] Fetching payments for userId: ${userId}, page: ${page}, pageSize: ${pageSize}`,
    );

    // Fetch total count for pagination
    const totalCount = await prisma.costPayment.count({
      where: { userId },
    });

    // Fetch cost payments for the user, ordered by most recent first
    const costPayments = await prisma.costPayment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: page * pageSize,
      take: pageSize,
      select: {
        id: true,
        amount: true,
        consumption: true,
        type: true,
        createdAt: true,
      },
    });

    console.log(
      `[Cost Payments GET] Retrieved ${costPayments.length} payments for userId: ${userId}`,
    );

    // Fetch all payments for this user to calculate running balance
    const allPaymentsForBalance = await prisma.costPayment.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        amount: true,
        type: true,
      },
    });

    // Create a map of payment ID to calculated balance
    const balanceMap = new Map<string, number>();
    let runningBalance = 0;

    for (const payment of allPaymentsForBalance) {
      if (payment.type === "PAYMENT") {
        // Payments increase balance
        runningBalance += payment.amount;
      } else if (payment.type === "ELECTRICITY_CHARGES") {
        // Electricity charges decrease balance (amount is already negative)
        runningBalance += payment.amount;
      }
      balanceMap.set(payment.id, runningBalance);
    }

    // Transform the data to match the ElectricityData interface
    const formattedPayments = costPayments.map((payment) => {
      const calculatedBalance = balanceMap.get(payment.id) ?? 0;
      return {
        id: payment.id,
        date: new Date(payment.createdAt).toLocaleDateString("en-GB"),
        type:
          payment.type === "PAYMENT"
            ? "Payment"
            : payment.type === "ELECTRICITY_CHARGES"
              ? "Electricity Charges"
              : payment.type,
        consumption:
          payment.consumption > 0
            ? `${payment.consumption.toFixed(2)} kWh`
            : "N/A",
        amount:
          (payment.type === "PAYMENT" ? "+ " : "- ") +
          `${Math.abs(payment.amount).toFixed(2)} $`,
        balance:
          (calculatedBalance >= 0 ? "+ " : "- ") +
          `${Math.abs(calculatedBalance).toFixed(2)} $`,
        rawBalance: calculatedBalance,
        rawAmount: payment.amount,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: formattedPayments,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Cost Payments GET] Error fetching payments:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost payments" },
      { status: 500 },
    );
  }
}

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

    console.log(
      `[Cost Payment] Created payment entry: ${costPayment.id} for user: ${customerId}`,
    );

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
