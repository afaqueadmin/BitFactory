import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { InvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
// import { binanceRequest } from "@/lib/binance";
import { getInvoiceForPayer } from "@/lib/accounting/invoicePayerAccess";
import {
  getUserBinanceSubaccount,
  subaccountAddress,
  SUBACCOUNT_NETWORK_LABELS,
  type SubaccountNetwork,
} from "@/lib/binanceSubaccounts";
// import { db } from "@/lib/db"; // your ORM (Prisma, Drizzle, etc.)

// export async function POST(
//     req: Request,
//     { params }: { params: Promise<{ id: string }> }
// ) {
//     // 1. Auth: only your own backend/admin should be able to call this
//     // if (req.headers.get("authorization") !== `Bearer ${process.env.INTERNAL_API_SECRET}`) {
//     //     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     // }
//
//     const { id } = await params;
//
//     // 2. Idempotency: don't burn sub-account quota on repeat calls
//     // const invoice = await db.invoice.findUnique({ where: { id } });
//     // if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
//     // if (invoice.binanceSubEmail) {
//     //   return NextResponse.json({ email: invoice.binanceSubEmail, existing: true });
//     // }
//
//     // 3. Binance wants a plain string and builds the virtual email from it.
//     //    Keep it alphanumeric and short (verify the current length limit in the docs).
//     // const subAccountString = `inv${id.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`.slice(0, 20);
//     const subAccountString = 'inv-1';
//
//     try {
//         const result = await binanceRequest<{ email: string }>(
//             "POST",
//             "/sapi/v1/sub-account/virtualSubAccount",
//             { subAccountString }
//         );
//
//         console.log('result');
//         console.log(result);
//
//         // 4. Persist the mapping: invoice -> sub-account email
//         // await db.invoice.update({
//         //   where: { id },
//         //   data: { binanceSubEmail: result.email },
//         // });
//
//         return NextResponse.json({ email: result.email });
//     } catch (err: any) {
//         console.error("Create sub-account failed:", err.message);
//         return NextResponse.json({ error: "Failed to create sub-account" }, { status: 502 });
//     }
// }

const CHECKOUT_REUSE_MS = 24 * 60 * 60 * 1000;

/**
 * POST → starts Binance checkout for the invoice; returns the invoice
 * customer's USDT deposit addresses (TRON + ETH, from binance_subaccounts)
 * as QR codes.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await params;
  const access = await getInvoiceForPayer(req, invoiceId);
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
  if (invoice.status === InvoiceStatus.PROCESSING) {
    return NextResponse.json(
      { error: "A payment for this invoice is already being processed" },
      { status: 409 },
    );
  }

  // The customer's own sub-account, not the caller's: staff and franchisees
  // can open checkout on a customer's invoice too.
  const sub = await getUserBinanceSubaccount(invoice.userId, "USDT");
  const networks = sub
    ? (Object.keys(SUBACCOUNT_NETWORK_LABELS) as SubaccountNetwork[])
        .map((network) => ({
          network,
          address: subaccountAddress(sub, network),
        }))
        .filter(
          (n): n is { network: SubaccountNetwork; address: string } =>
            !!n.address,
        )
    : [];
  if (networks.length === 0) {
    return NextResponse.json(
      {
        error:
          "Binance payment isn't set up for this account yet. Please contact support.",
      },
      { status: 409 },
    );
  }

  // Keep an existing start time so reopening checkout doesn't drop a
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
        network: SUBACCOUNT_NETWORK_LABELS[n.network],
        address: n.address,
        qrDataUrl: await QRCode.toDataURL(n.address, { width: 280, margin: 1 }),
      })),
    ),
  });
}

// const ALLOWED_NETWORKS = ["ETH", "TRX"] as const;
// const ALLOWED_COINS = ["USDT", "USDC"] as const;
//
// type DepositAddress = {
//     address: string;
//     coin: string;
//     tag: string; // empty for USDT, used by memo coins like XRP
//     url: string;
// };

// export async function GET(req: Request) {
//     // 1. Auth: only your own backend should call this
//     // if (req.headers.get("authorization") !== `Bearer ${process.env.INTERNAL_API_SECRET}`) {
//     //     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     // }
//
//     const { searchParams } = new URL(req.url);
//     console.log('searchParams:', searchParams);
//     const email = searchParams.get("email");
//     const coin = (searchParams.get("coin") ?? "USDT").toUpperCase();
//     const network = (searchParams.get("network") ?? "TRX").toUpperCase();
//
//     console.log('email:', email);
//     console.log('coin:', coin);
//     console.log('network:', network);
//
//     // 2. Validate input
//     if (!email) {
//         return NextResponse.json({ error: "email is required" }, { status: 400 });
//     }
//     if (!ALLOWED_COINS.includes(coin as any)) {
//         return NextResponse.json({ error: `coin must be one of ${ALLOWED_COINS.join(", ")}` }, { status: 400 });
//     }
//     if (!ALLOWED_NETWORKS.includes(network as any)) {
//         return NextResponse.json({ error: `network must be one of ${ALLOWED_NETWORKS.join(", ")}` }, { status: 400 });
//     }
//
//     // 3. Optional: return a cached address from your DB first
//     // const cached = await db.depositAddress.findUnique({
//     //   where: { email_coin_network: { email, coin, network } },
//     // });
//     // if (cached) return NextResponse.json(cached);
//
//     try {
//         const addr = await binanceRequest<DepositAddress>(
//             "GET",
//             "/sapi/v1/capital/deposit/subAddress",
//             { email, coin, network }
//         );
//
//         console.log('addr');
//         console.log(addr);
//
//         // await db.depositAddress.create({ data: { email, coin, network, address: addr.address, tag: addr.tag } });
//
//         return NextResponse.json({
//             address: addr.address,
//             coin: addr.coin,
//             network,
//             tag: addr.tag || null,
//         });
//     } catch (err: any) {
//         console.error("Get sub-account deposit address failed:", err.message);
//         return NextResponse.json({ error: "Failed to get deposit address" }, { status: 502 });
//     }
// }
