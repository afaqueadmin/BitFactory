import { NextResponse } from "next/server";
import { fetchLiveBtcPrice } from "@/lib/services/btcPriceService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const priceData = await fetchLiveBtcPrice();
    return NextResponse.json({
      success: true,
      symbol: priceData.symbol,
      price: priceData.price,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[BTC Price API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch BTC price",
      },
      { status: 500 },
    );
  }
}
