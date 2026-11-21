import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { getGroupByUserId } from "@/lib/groupUtils";
import { getClientGroupIds } from "@/lib/luxorSubaccounts";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, [
      "invoicing.view",
      "invoicing.create",
      "invoicing.edit",
      "customers.create",
      "customers.edit",
    ]);
    if ("response" in auth) return auth.response;

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
      select: { id: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    const [group, groupIds] = await Promise.all([
      getGroupByUserId(customer.id),
      // Every group the client is in - more than one when their Luxor
      // subaccounts are split across groups.
      getClientGroupIds(customer.id),
    ]);

    return NextResponse.json({ group: group || null, groupIds });
  } catch (error) {
    console.error("Get customer group error:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer group" },
      { status: 500 },
    );
  }
}
