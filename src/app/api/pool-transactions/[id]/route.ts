/**
 * Pool Transaction [id] API Routes
 * GET/PUT/DELETE for a single PoolTransaction. Admin/Super Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function verifyAdminAuth(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) throw new Error("Unauthorized: No token provided");

  const decoded = await verifyJwtToken(token);
  if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden: Admin access required");
  }
  return { userId: decoded.userId, role: decoded.role };
}

const transactionSelect = {
  id: true,
  poolId: true,
  poolSubaccountId: true,
  externalTransactionId: true,
  transactionType: true,
  category: true,
  amount: true,
  usdEquivalent: true,
  addressName: true,
  status: true,
  occurredAt: true,
  createdAt: true,
  poolSubaccount: {
    select: {
      id: true,
      subaccountName: true,
      pool: { select: { id: true, name: true } },
    },
  },
} as const;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyAdminAuth(request);
    const { id } = await params;
    const body = await request.json();
    const {
      externalTransactionId,
      transactionType,
      category,
      amount,
      usdEquivalent,
      addressName,
      status,
      occurredAt,
    } = body;

    if (!transactionType || !["credit", "debit"].includes(transactionType)) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: "transactionType must be 'credit' or 'debit'",
        },
        { status: 400 },
      );
    }
    if (amount === undefined || amount === "" || Number.isNaN(Number(amount))) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "amount is required and must be numeric" },
        { status: 400 },
      );
    }

    const transaction = await prisma.poolTransaction.update({
      where: { id },
      data: {
        externalTransactionId: externalTransactionId?.trim() || null,
        transactionType,
        category: category?.trim() || null,
        amount: Number(amount),
        usdEquivalent:
          usdEquivalent === "" || usdEquivalent === undefined
            ? null
            : Number(usdEquivalent),
        addressName: addressName?.trim() || null,
        status: status?.trim() || null,
        ...(occurredAt ? { occurredAt: new Date(occurredAt) } : {}),
      },
      select: transactionSelect,
    });

    return NextResponse.json<ApiResponse>({ success: true, data: transaction });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Internal server error";
    const status = msg.includes("Forbidden")
      ? 403
      : msg.includes("Unauthorized")
        ? 401
        : msg.includes("Record to update not found")
          ? 404
          : 500;
    return NextResponse.json<ApiResponse>(
      { success: false, error: status === 404 ? "Transaction not found" : msg },
      { status },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await verifyAdminAuth(request);
    const { id } = await params;

    await prisma.poolTransaction.delete({ where: { id } });

    return NextResponse.json<ApiResponse>({ success: true });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Internal server error";
    const status = msg.includes("Forbidden")
      ? 403
      : msg.includes("Unauthorized")
        ? 401
        : msg.includes("Record to delete does not exist")
          ? 404
          : 500;
    return NextResponse.json<ApiResponse>(
      { success: false, error: status === 404 ? "Transaction not found" : msg },
      { status },
    );
  }
}
