import { NextRequest, NextResponse } from "next/server";
import { ConfirmoPaymentService } from "@/services/confirmoPaymentService";
import crypto from "crypto";

/**
 * POST /api/webhooks/confirmo
 *
 * Webhook endpoint that Confirmo calls when payment status changes
 *
 * Configure this URL in Confirmo dashboard:
 * https://my.bitfactory.ae/api/webhooks/confirmo
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log("📨 Confirmo webhook received:", {
      id: body.id,
      status: body.status,
      reference: body.reference,
      timestamp: new Date().toISOString(),
    });

    // Verify webhook signature (if Confirmo provides it)
    const signature = request.headers.get("X-Confirmo-Signature");
    if (signature && process.env.CONFIRMO_WEBHOOK_SECRET) {
      if (!verifyWebhookSignature(body, signature)) {
        console.error("❌ Invalid webhook signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    }

    // Process webhook
    const service = new ConfirmoPaymentService();
    const payment = await service.handleWebhook(body);

    console.log("✅ Webhook processed successfully:", {
      confirmoInvoiceId: body.id,
      invoiceNumber: payment.reference,
      status: payment.status,
    });

    return NextResponse.json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("❌ Confirmo webhook error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Webhook processing failed",
        message: err.message,
      },
      { status: 500 },
    );
  }
}

function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.CONFIRMO_WEBHOOK_SECRET || "";

  if (!secret || secret === "your_webhook_secret_from_confirmo_dashboard") {
    console.warn(
      "⚠️ CONFIRMO_WEBHOOK_SECRET not set, skipping signature verification",
    );
    return true;
  }

  const computed = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
