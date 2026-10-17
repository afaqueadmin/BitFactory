import { NextRequest, NextResponse } from "next/server";
import type { Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";

/** Loads an invoice if the caller is its customer, an admin, or the customer's franchisee. */
export async function getInvoiceForPayer(
  req: NextRequest,
  invoiceId: string | null | undefined,
): Promise<{ invoice: Invoice; userId: string } | { error: NextResponse }> {
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
  const isAdmin =
    currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN";
  const isCustomersFranchisee =
    currentUser.role === "FRANCHISEE" &&
    (await assertFranchiseeOwnsCustomer(currentUser.userId, invoice.userId));

  if (!isOwner && !isAdmin && !isCustomersFranchisee) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { invoice, userId: currentUser.userId };
}
