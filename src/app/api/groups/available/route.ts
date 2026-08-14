import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { franchiseeUserFilter } from "@/lib/franchiseeScope";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

async function getAuthenticatedUser(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return null;
    return await verifyJwtToken(token);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse,
        { status: 401 },
      );
    }

    if (
      user.role !== "ADMIN" &&
      user.role !== "SUPER_ADMIN" &&
      user.role !== "FRANCHISEE"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can access",
        } as ApiResponse,
        { status: 403 },
      );
    }

    // Get all PoolAuth rows for in-scope users (any pool)
    const allPoolAuths = await prisma.poolAuth.findMany({
      where: {
        user: {
          isDeleted: false,
          ...franchiseeUserFilter({ id: user.userId, role: user.role }),
        },
      },
      select: {
        id: true,
        authKey: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            luxorSubaccountName: true,
            miners: { where: { isDeleted: false }, select: { id: true } },
          },
        },
      },
    });

    // Get all PoolAuth ids and user ids that are already assigned to any group
    const allGrouped = await prisma.groupSubaccount.findMany({
      select: { poolAuthId: true, userId: true },
    });
    const groupedPoolAuthIds = new Set(
      allGrouped.map((s) => s.poolAuthId).filter((id): id is string => !!id),
    );
    const groupedUserIds = new Set(
      allGrouped.map((s) => s.userId).filter((id): id is string => !!id),
    );

    const available = allPoolAuths
      .filter((pa) => !groupedPoolAuthIds.has(pa.id))
      .map((pa) => ({
        id: pa.id,
        poolAuthId: pa.id,
        subaccountName: pa.authKey,
        user: {
          id: pa.user.id,
          name: pa.user.name || "Unknown",
          email: pa.user.email || "unknown@example.com",
          role: pa.user.role,
          luxorSubaccountName: pa.user.luxorSubaccountName || "",
        },
        minerCount: pa.user.miners.length,
      }));

    // CLIENT users with no Luxor subaccount can still be added to a group
    // directly (userId-based membership) - list those not already grouped.
    const subaccountlessUsers = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        isDeleted: false,
        poolAuths: { none: {} },
        id: { notIn: Array.from(groupedUserIds) },
        ...franchiseeUserFilter({ id: user.userId, role: user.role }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        luxorSubaccountName: true,
        miners: { where: { isDeleted: false }, select: { id: true } },
      },
    });

    const availableUsers = subaccountlessUsers.map((u) => ({
      id: u.id,
      userId: u.id,
      subaccountName: null,
      user: {
        id: u.id,
        name: u.name || "Unknown",
        email: u.email || "unknown@example.com",
        role: u.role,
        luxorSubaccountName: u.luxorSubaccountName || "",
      },
      minerCount: u.miners.length,
    }));

    return NextResponse.json(
      { success: true, data: [...available, ...availableUsers] } as ApiResponse,
      { status: 200 },
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMsg } as ApiResponse,
      { status: 500 },
    );
  }
}
