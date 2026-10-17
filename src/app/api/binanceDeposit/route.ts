import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BINANCE_USDT_NETWORKS } from "@/lib/binance";
import { getInvoiceForPayer } from "@/lib/accounting/invoicePayerAccess";

export const runtime = "nodejs";

const CHECKOUT_REUSE_MS = 24 * 60 * 60 * 1000;

/** POST { invoiceId } → USDT deposit addresses (TRON + ETH) as QR codes. */
export async function POST(req: NextRequest) {
  const networks = BINANCE_USDT_NETWORKS.filter((n) => n.address);
  if (networks.length === 0) {
    return NextResponse.json(
      { error: "Binance payments are not configured" },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const access = await getInvoiceForPayer(req, body.invoiceId?.trim());
  if ("error" in access) return access.error;
  const { invoice } = access;

  if (
    invoice.status === InvoiceStatus.PAID ||
    invoice.status === InvoiceStatus.CANCELLED ||
    invoice.status === InvoiceStatus.DRAFT
  ) {
    return NextResponse.json(
      { error: "This invoice cannot be paid" },
      { status: 409 },
    );
  }

  // Keep an existing start time so reopening the modal doesn't drop a
  // payment that is already on its way.
  const startedAt = invoice.binanceCheckoutStartedAt;
  if (!startedAt || Date.now() - startedAt.getTime() > CHECKOUT_REUSE_MS) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { binanceCheckoutStartedAt: new Date() },
    });
  }

  return NextResponse.json({
    amount: invoice.totalAmount.toFixed(2),
    currency: "USDT",
    networks: await Promise.all(
      networks.map(async (n) => ({
        network: n.label,
        address: n.address,
        qrDataUrl: await QRCode.toDataURL(n.address, { width: 280, margin: 1 }),
      })),
    ),
  });
}
