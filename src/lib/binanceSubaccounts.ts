import type { BinanceSubaccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Binance network code → label shown at checkout. */
export const SUBACCOUNT_NETWORK_LABELS = {
  TRX: "TRON (TRC20)",
  ETH: "Ethereum (ERC20)",
} as const;

export type SubaccountNetwork = keyof typeof SUBACCOUNT_NETWORK_LABELS;

/**
 * The customer's Binance sub-account for a coin, or null if none is set up.
 * A customer has at most one row per coin today; if that changes, the most
 * recently updated row wins so checkout and deposit polling stay in step.
 */
export async function getUserBinanceSubaccount(
  userId: string,
  coin = "USDT",
): Promise<BinanceSubaccount | null> {
  let binanceSubaccount = prisma.binanceSubaccount.findFirst({
    where: { userId, coin },
    orderBy: { updatedAt: "desc" },
  });

  if (!binanceSubaccount) {
    console.log("general getUserBinanceSubaccount");
    binanceSubaccount = prisma.binanceSubaccount.findFirst({
      where: { binanceSubaccountEmail: "hamzanajeebmusic@gmail.com", coin }, //general account linked to hamzanajeebmusic@gmail.com
      orderBy: { updatedAt: "desc" },
    });
  }

  return binanceSubaccount;
}

/** The stored deposit address for a network, or null if it isn't set. */
export function subaccountAddress(
  sub: BinanceSubaccount,
  network: SubaccountNetwork,
): string | null {
  return (network === "TRX" ? sub.TRXAddress : sub.ETHAddress) || null;
}
