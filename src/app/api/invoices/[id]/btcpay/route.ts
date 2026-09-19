// app/api/invoices/[id]/btcpay/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createBtcpayInvoice, isBtcpayEnabled } from "@/lib/btcpay";
import { InvoiceStatus } from "@prisma/client";
import { verifyJwtToken } from "@/lib/jwt";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isBtcpayEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = req.cookies.get("token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let currentUser;
  try {
    currentUser = await verifyJwtToken(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  console.log("params", params);
  const invoice = await prisma.invoice.findUnique({
    where: { id: id },
    include: { user: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Only the invoice's customer, an admin, or the customer's franchisee may pay it
  const isOwner = invoice.userId === currentUser.userId;
  const isAdmin =
    currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN";
  const isCustomersFranchisee =
    currentUser.role === "FRANCHISEE" &&
    (await assertFranchiseeOwnsCustomer(currentUser.userId, invoice.userId));

  if (!isOwner && !isAdmin && !isCustomersFranchisee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (invoice.status === InvoiceStatus.PAID) {
    return NextResponse.json(
      { error: "Invoice is already paid" },
      { status: 400 },
    );
  }

  // Reuse an existing BTCPay invoice if one is still active
  const isReusable =
    invoice.btcpayCheckoutUrl &&
    (invoice.btcpayStatus === "New" || invoice.btcpayStatus === "Processing") &&
    invoice.btcpayCreatedAt &&
    Date.now() - invoice.btcpayCreatedAt.getTime() < 60 * 60 * 1000; // 60 min window

  if (isReusable) {
    return NextResponse.json({ checkoutUrl: invoice.btcpayCheckoutUrl });
  }

  const btcpayInvoice = await createBtcpayInvoice({
    invoiceId: invoice.id,
    amount: Number(invoice.totalAmount),
    currency: "USD",
    clientEmail: invoice.user?.email,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invoices/${invoice.id}`,
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      btcpayInvoiceId: btcpayInvoice.id,
      btcpayCheckoutUrl: btcpayInvoice.checkoutLink,
      btcpayStatus: btcpayInvoice.status,
      btcpayCreatedAt: new Date(),
    },
  });

  return NextResponse.json({ checkoutUrl: btcpayInvoice.checkoutLink });
}
