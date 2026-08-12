import { BORROWING_RATE_APR } from "./paybackCalculations";

export type PaybackStrategyKey = "STRATEGY_1" | "STRATEGY_2" | "STRATEGY_3";

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
  STRATEGY_1: {
    headline: "The miner pays its own bills",
    detail:
      "Each month a portion of the mined Bitcoin is sold to cover hosting and power. Everything left over is yours.",
  },
  STRATEGY_2: {
    headline: "Keep the Bitcoin, fund the bills separately",
    detail:
      "Nothing mined is ever sold. The monthly bill is settled from another source and the full Bitcoin stack is held for the machine's life.",
  },
  STRATEGY_3: {
    headline: `Keep the Bitcoin, borrow at ${BORROWING_RATE_APR.toFixed(2)}% APR`,
    detail: `Nothing mined is sold. The monthly bill is drawn on a loan secured against the accumulating Bitcoin, repaid at the end. Interest is charged at ${BORROWING_RATE_APR.toFixed(2)}% APR.`,
  },
};
