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
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access customers" },
        { status: 403 },
      );
    }

    // Fetch all customers (users with role CLIENT)
    const customers = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        luxorSubaccountName: true,
      },
      orderBy: { name: "asc" },
    });

    // Format response: "John Doe (Mining-Account-1)" or "John Doe (No subaccount assigned)"
    const formattedCustomers = customers.map((c) => ({
      id: c.id,
      displayName: `${c.name || "Unnamed Customer"} (${c.luxorSubaccountName || "No subaccount assigned"})`,
      name: c.name,
      luxorSubaccountName: c.luxorSubaccountName,
    }));

    return NextResponse.json({
      customers: formattedCustomers,
    });
  } catch (error) {
    console.error("Failed to fetch customers:", error);
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 },
    );
  }
}
