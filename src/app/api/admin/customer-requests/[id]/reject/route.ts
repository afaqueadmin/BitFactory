/**
 * POST /api/admin/customer-requests/[id]/reject
 *
 * Rejects a pending franchisee customer request. ADMIN/SUPER_ADMIN/ACCOUNTING
 * only.
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStaff(request, [
      "franchisees.reject_customer_requests",
    ]);
    if ("response" in auth) return auth.response;
    const decoded = auth.decoded;

    const customerRequest = await prisma.franchiseCustomerRequest.findUnique({
      where: { id },
    });

    if (!customerRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }

    if (customerRequest.status !== "PENDING") {
      return NextResponse.json(
        {
          success: false,
          error: `Request has already been ${customerRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : null;

    await prisma.franchiseCustomerRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: decoded.userId,
        reviewedAt: new Date(),
        rejectionReason: reason || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.CUSTOMER_REQUEST_REJECTED,
        entityType: "FranchiseCustomerRequest",
        entityId: id,
        userId: decoded.userId,
        description: `Customer request for ${customerRequest.name} (${customerRequest.email}) rejected${reason ? `: ${reason}` : ""}`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Request rejected",
    });
  } catch (error) {
    console.error("[Admin Customer Requests API] reject error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reject request" },
      { status: 500 },
    );
  }
}
