import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { franchiseeUserFilter } from "@/lib/franchiseeScope";

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
      select: { id: true, role: true },
    });

    if (
      user?.role !== "ADMIN" &&
      user?.role !== "SUPER_ADMIN" &&
      user?.role !== "FRANCHISEE"
    ) {
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
        ...franchiseeUserFilter(user),
      },
      select: {
        id: true,
        name: true,
        luxorSubaccountName: true,
        poolAuths: {
          where: { pool: { name: "Luxor" } },
          select: { authKey: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // Format response: "John Doe (Mining-Account-1)" or "John Doe (No subaccount assigned)"
    const formattedCustomers = customers.map((c) => {
      const luxorIdentifier = c.poolAuths[0]?.authKey || c.luxorSubaccountName;
      return {
        id: c.id,
        displayName: `${c.name || "Unnamed Customer"} (${luxorIdentifier || "No subaccount assigned"})`,
        name: c.name,
        luxorSubaccountName: luxorIdentifier,
      };
    });

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
