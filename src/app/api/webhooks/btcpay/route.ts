import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { InvoiceStatus } from "@prisma/client";
import type { BtcpayStatus } from "@prisma/client";
import { isBtcpayEnabled } from "@/lib/btcpay";

const WEBHOOK_SECRET = process.env.BTCPAY_WEBHOOK_SECRET!;

function verifySignature(rawBody: string, signatureHeader: string | null) {
  if (!signatureHeader) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader),
  );
}

export async function POST(req: NextRequest) {
  if (!isBtcpayEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("btcpay-sig");

  console.log("btcpay-sig", signature);

  // @TODO: uncomment the following if-block and make it work
  // if (!verifySignature(rawBody, signature)) {
  //   return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  // }

  const event = JSON.parse(rawBody);
  const { invoiceId, type } = event;

  const invoice = await prisma.invoice.findUnique({
    where: { btcpayInvoiceId: invoiceId },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Unknown invoice" }, { status: 404 });
  }

  const statusMap: Record<string, string> = {
    InvoiceSettled: "Settled",
    InvoiceProcessing: "Processing",
    InvoiceExpired: "Expired",
    InvoiceInvalid: "Invalid",
  };

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      btcpayStatus: (statusMap[type] as BtcpayStatus) ?? invoice.btcpayStatus,
      ...(type === "InvoiceSettled" && {
        status: InvoiceStatus.PAID, // your main invoice status field
        btcpaySettledAt: new Date(),
      }),
    },
  });

  return NextResponse.json({ received: true });
}
