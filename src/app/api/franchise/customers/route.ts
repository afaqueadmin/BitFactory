/**
 * GET /api/franchise/customers
 *
 * Lists the calling franchisee's own onboarded customers (CLIENT users
 * attached to their Franchise). FRANCHISEE role only. Independent of the
 * admin /api/user/all route — no shared code, so admin behavior can't
 * regress from franchise-specific changes here.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { franchiseeUserFilter } from "@/lib/franchiseeScope";
import { PaymentType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    if (decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        { success: false, error: "Franchisee access required" },
        { status: 403 },
      );
    }

    const currentUser = { id: decoded.userId, role: decoded.role };
    const includeDeleted =
      request.nextUrl.searchParams.get("isDeleted") === "true";

    const customers = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        ...(includeDeleted ? {} : { isDeleted: false }),
        ...franchiseeUserFilter(currentUser),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        city: true,
        country: true,
        phoneNumber: true,
        companyName: true,
        streetAddress: true,
        twoFactorEnabled: true,
        createdAt: true,
        isDeleted: true,
        franchiseeId: true,
        segment: true,
        miners: {
          where: { isDeleted: false },
          select: { id: true, status: true },
        },
        poolAuths: {
          select: { pool: { select: { name: true } } },
        },
        costPayments: {
          where: {
            type: { not: PaymentType.HARDWARE_SALES },
            isDeleted: false,
          },
          select: { amount: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const transformed = customers.map((c) => {
      const balance = c.costPayments
        .reduce((sum, p) => sum + (p.amount || 0), 0)
        .toFixed(2);
      const hasActiveMiner = c.miners.some((m) => m.status === "AUTO");

      return {
        id: c.id,
        email: c.email,
        name: c.name || "N/A",
        role: c.role,
        city: c.city || "N/A",
        country: c.country || "N/A",
        phoneNumber: c.phoneNumber || "N/A",
        companyName: c.companyName || "N/A",
        streetAddress: c.streetAddress || "N/A",
        pools: c.poolAuths
          .map((pa) => pa.pool.name)
          .sort()
          .join(", "),
        twoFactorEnabled: c.twoFactorEnabled,
        joinDate: c.createdAt.toISOString().split("T")[0],
        miners: c.miners.length,
        status: hasActiveMiner ? "active" : "inactive",
        isDeleted: c.isDeleted,
        franchiseeId: c.franchiseeId,
        segment: c.segment,
        balance,
      };
    });

    return NextResponse.json(
      { success: true, users: transformed },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (error) {
    console.error("[Franchise Customers API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch customers" },
      { status: 500 },
    );
  }
}
