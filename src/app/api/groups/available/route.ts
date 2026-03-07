import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

interface ApiResponse<T = Record<string, unknown>> {
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

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only Admin/Super Admin can access",
        } as ApiResponse,
        { status: 403 },
      );
    }

    // Get all users with a luxor subaccount name
    const allUsers = await prisma.user.findMany({
      where: { isDeleted: false, luxorSubaccountName: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        luxorSubaccountName: true,
        miners: { where: { isDeleted: false }, select: { id: true } },
      },
    });

    // Get all subaccount names that are already assigned to any group
    const allGrouped = await prisma.groupSubaccount.findMany({
      select: { subaccountName: true },
    });
    const allGroupedNames = allGrouped.map((s) => s.subaccountName);

    const available = allUsers
      .filter((u) => !allGroupedNames.includes(u.luxorSubaccountName || ""))
      .map((user) => ({
        id: user.id,
        subaccountName: user.luxorSubaccountName || "",
        user: {
          id: user.id,
          name: user.name || "Unknown",
          email: user.email || "unknown@example.com",
          role: user.role,
          luxorSubaccountName: user.luxorSubaccountName || "",
        },
        minerCount: user.miners.length,
      }));

    return NextResponse.json(
      { success: true, data: available } as ApiResponse,
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
