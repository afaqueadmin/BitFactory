/**
 * /api/franchise/customers/[id]
 *
 * Direct edit/delete of an EXISTING customer already attached to the calling
 * franchisee's franchise (approval only gates customer *creation*, not
 * edits/deletes of customers that already exist). FRANCHISEE role only,
 * ownership-checked on every request.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";

async function requireFranchisee(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: "Unauthorized", status: 401 as const };

  let decoded;
  try {
    decoded = await verifyJwtToken(token);
  } catch {
    return { error: "Invalid token", status: 401 as const };
  }

  if (decoded.role !== "FRANCHISEE") {
    return { error: "Franchisee access required", status: 403 as const };
  }

  return { decoded };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireFranchisee(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const owns = await assertFranchiseeOwnsCustomer(auth.decoded.userId, id);
    if (!owns) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const {
      name,
      phoneNumber,
      companyName,
      streetAddress,
      city,
      country,
      companyUrl,
      luxorSubaccountName,
    } = body;

    if (luxorSubaccountName !== undefined && luxorSubaccountName !== null) {
      const trimmed = String(luxorSubaccountName).trim();
      if (!trimmed) {
        return NextResponse.json(
          { success: false, error: "Luxor subaccount cannot be empty" },
          { status: 400 },
        );
      }
      const existing = await prisma.user.findFirst({
        where: { luxorSubaccountName: trimmed, id: { not: id } },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: "This Luxor subaccount is already assigned",
          },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(companyName !== undefined && { companyName }),
        ...(streetAddress !== undefined && { streetAddress }),
        ...(city !== undefined && { city }),
        ...(country !== undefined && { country }),
        ...(companyUrl !== undefined && { companyUrl }),
        ...(luxorSubaccountName !== undefined && {
          luxorSubaccountName: String(luxorSubaccountName).trim(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Customer updated successfully",
      user: updated,
    });
  } catch (error) {
    console.error("[Franchise Customers API] PUT error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update customer" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireFranchisee(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status },
      );
    }

    const owns = await assertFranchiseeOwnsCustomer(auth.decoded.userId, id);
    if (!owns) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 },
      );
    }

    const activeMinerCount = await prisma.miner.count({
      where: { userId: id, isDeleted: false },
    });
    if (activeMinerCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cannot delete a customer with active miners. Remove their miners first.",
        },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id },
      data: { isDeleted: true },
    });

    return NextResponse.json({
      success: true,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    console.error("[Franchise Customers API] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete customer" },
      { status: 500 },
    );
  }
}
