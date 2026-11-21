/**
 * src/app/api/franchisees/[id]/customers/route.ts
 * GET /api/franchisees/[id]/customers
 *
 * Lists the CLIENT users (customers) attached to a given franchise
 * (User.franchiseeId -> Franchise.id). Admin-facing counterpart to
 * /api/franchise/customers, which is scoped to the logged-in franchisee.
 *
 * Authorization: Admin/Super Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const user = await authorizeStaff(request, ["franchisees.view"]);
    if ("response" in user) return user.response;

    const franchise = await prisma.franchise.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!franchise || franchise.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Franchise not found" } as ApiResponse,
        { status: 404 },
      );
    }

    const customers = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        franchiseeId: id,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        companyName: true,
        phoneNumber: true,
        createdAt: true,
        segment: true,
        miners: {
          where: { isDeleted: false },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      companyName: c.companyName,
      phoneNumber: c.phoneNumber,
      createdAt: c.createdAt,
      segment: c.segment,
      minerCount: c.miners.length,
    }));

    return NextResponse.json(
      { success: true, data } as unknown as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[Franchisees API] GET[id]/customers - Error:", errorMsg);
    return NextResponse.json(
      { success: false, error: errorMsg } as ApiResponse,
      { status: 500 },
    );
  }
}
