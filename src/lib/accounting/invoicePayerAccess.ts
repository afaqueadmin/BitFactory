import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import type { Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { requireStaffPermission } from "@/lib/auth/authorization";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";

/** Loads an invoice if the caller is its customer, an admin, or the customer's franchisee. */
export async function getInvoiceForPayer(
  req: NextRequest,
  invoiceId: string | null | undefined,
): Promise<
  { invoice: Invoice; userId: string; role: string } | { error: NextResponse }
> {
  const token = req.cookies.get("token")?.value;
  if (!token) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let currentUser;
  try {
    currentUser = await verifyJwtToken(token);
  } catch {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!invoiceId) {
    return {
      error: NextResponse.json(
        { error: "invoiceId is required" },
        { status: 400 },
      ),
    };
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    return {
      error: NextResponse.json({ error: "Invoice not found" }, { status: 404 }),
    };
  }

  const isOwner = invoice.userId === currentUser.userId;
  const isAdmin = isStaffRole(currentUser.role);
  const isCustomersFranchisee =
    currentUser.role === "FRANCHISEE" &&
    (await assertFranchiseeOwnsCustomer(currentUser.userId, invoice.userId));

  if (!isOwner && !isAdmin && !isCustomersFranchisee) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  // RBAC: staff opening someone else's invoice need invoicing.view.
  if (isAdmin && !isOwner && !isCustomersFranchisee) {
    const denied = await requireStaffPermission(req, ["invoicing.view"]);
    if (denied) return { error: denied };
  }

  return { invoice, userId: currentUser.userId, role: currentUser.role };
}
