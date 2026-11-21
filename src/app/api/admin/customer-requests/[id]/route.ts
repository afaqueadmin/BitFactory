/**
 * DELETE /api/admin/customer-requests/[id]
 *
 * Deletes a franchisee customer request record. ADMIN/SUPER_ADMIN/ACCOUNTING
 * only. Safe for requests in any status — deleting an APPROVED request only
 * removes the request log entry, not the customer User it created.
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";

export async function DELETE(
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

    await prisma.franchiseCustomerRequest.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.CUSTOMER_REQUEST_DELETED,
        entityType: "FranchiseCustomerRequest",
        entityId: id,
        userId: decoded.userId,
        description: `Customer request for ${customerRequest.name} (${customerRequest.email}) deleted`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Request deleted",
    });
  } catch (error) {
    console.error("[Admin Customer Requests API] delete error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete request" },
      { status: 500 },
    );
  }
}
