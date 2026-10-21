import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { franchiseeUserFilter } from "@/lib/franchiseeScope";
import { hostingEligibleUserFilter } from "@/lib/hostingEligibility";

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

    // ?scope=hosting limits the list to customers who can be billed for
    // hosting (excludes potential customers and customers with no segment).
    // ?scope=withMiners limits it to customers who own at least one
    // non-deleted miner (Hardware Repair invoices are per miner).
    // ?includeSimulated=1 (admin invoice screens) also lists simulated
    // accounts, which can be issued Hardware Sales and Hosting invoices.
    const searchParams = new URL(request.url).searchParams;
    const scope = searchParams.get("scope");
    const hostingOnly = scope === "hosting";
    const withMinersOnly = scope === "withMiners";
    const includeSimulated =
      searchParams.get("includeSimulated") === "1" &&
      (user.role === "ADMIN" || user.role === "SUPER_ADMIN");

    // Fetch all customers (users with role CLIENT, plus SIMULATED on request)
    const customers = await prisma.user.findMany({
      where: {
        role: includeSimulated ? { in: ["CLIENT", "SIMULATED"] } : "CLIENT",
        isDeleted: false,
        ...franchiseeUserFilter(user),
        // Simulated accounts have no segment but can still be billed hosting.
        ...(hostingOnly
          ? includeSimulated
            ? { OR: [hostingEligibleUserFilter(), { role: "SIMULATED" }] }
            : hostingEligibleUserFilter()
          : {}),
        ...(withMinersOnly ? { miners: { some: { isDeleted: false } } } : {}),
      },
      select: {
        id: true,
        name: true,
        role: true,
        poolAuths: {
          where: { pool: { name: "Luxor" } },
          orderBy: { createdAt: "asc" },
          select: { authKey: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // Format response: "John Doe (Mining-Account-1, Mining-Account-2)" or
    // "John Doe (No subaccount assigned)" - every Luxor subaccount joined.
    const formattedCustomers = customers.map((c) => {
      const names = c.poolAuths.map((pa) => pa.authKey);
      return {
        id: c.id,
        displayName: `${c.name || "Unnamed Customer"} (${names.length > 0 ? names.join(", ") : "No subaccount assigned"})${c.role === "SIMULATED" ? " - Simulated" : ""}`,
        name: c.name,
        luxorSubaccounts: names,
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
