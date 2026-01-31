import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access this" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 },
      );
    }

    // Fetch customer
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        luxorSubaccountName: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    if (!customer.luxorSubaccountName) {
      return NextResponse.json({ group: null });
    }

    // Fetch group by subaccount name
    const group = await prisma.group.findFirst({
      where: {
        subaccounts: {
          some: {
            subaccountName: customer.luxorSubaccountName,
          },
        },
      },
      select: {
        id: true,
        name: true,
        relationshipManager: true,
        email: true,
      },
    });

    return NextResponse.json({ group: group || null });
  } catch (error) {
    console.error("Get customer group error:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer group" },
      { status: 500 },
    );
  }
}
