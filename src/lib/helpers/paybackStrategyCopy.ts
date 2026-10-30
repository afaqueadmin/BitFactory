export type PaybackStrategyKey =
  "STRATEGY_0" | "STRATEGY_1A" | "STRATEGY_1B" | "STRATEGY_2" | "STRATEGY_3";

export interface PaybackStrategyCopy {
  /** One-line statement of what the strategy actually does. */
  headline: string;
  /** How the bills get paid, in plain terms. */
  detail: string;
}

/**
 * Buyer-facing wording for each funding strategy, shared by the payback
 * analysis pages so the scenario table and the charts narrate the same thing.
 */
export const STRATEGY_COPY: Record<PaybackStrategyKey, PaybackStrategyCopy> = {
  STRATEGY_0: {
    headline: "No Accumulation (Stable) - Sell all BTC, hold USDT",
    detail:
      "The miner receives the full BTC mining rewards directly from their machines into their wallet. Thereafter, the miner sells all of their mined Bitcoin, pays for the hosting and co-location charges in USD each month, and holds the balance in USDT instead of Bitcoin.",
  },
  STRATEGY_1A: {
    headline: "Auto Deduct Hybrid Accumulation",
    detail:
      "Hosting and co-location charges are auto-deducted from your BTC mining rewards earned by your machines. Hence, only net rewards in BTC are transferred to your wallet automatically.",
  },
  STRATEGY_1B: {
    headline: "Hybrid Accumulation",
    detail:
      "The miner receives the full BTC mining rewards directly from their machines into their wallet. Thereafter, the miner pays for the hosting and co-location charges in USD each month, by selling a portion of their mined Bitcoin.",
  },
  STRATEGY_2: {
    headline:
      "Accumulation strategy (intermediate) - keep the Bitcoin, fund the bills separately",
    detail:
      "The miner receives the full BTC mining rewards directly from their machines into their wallet. Nothing mined is ever sold by the miner. The monthly bill is settled from another source and the full Bitcoin stack is held for the machine's life.",
  },
  STRATEGY_3: {
    headline:
      "Accumulation strategy (professional) - keep the Bitcoin, borrow at 3.75% - 5.50% APR",
    detail:
      "The miner receives the full BTC mining rewards directly from their machines into their wallet. Nothing mined is sold by the miner. The monthly bill is drawn on a loan secured against the accumulating Bitcoin, to be repaid at the end. Please note - the loan is NOT provided by the hosting platform, rather by an external/third-party.",
  },
};
