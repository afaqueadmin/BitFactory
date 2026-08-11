export interface LuxorDifficultyAdjustmentPayload {
  difficultyAdjustment?: number | string | null;
  difficulty_change?: number | string | null;
  difficultyChange?: number | string | null;
  estimatedRetargetDate?: string | number | null;
  estimated_retarget_date?: string | number | null;
  progressPercent?: number | string | null;
  progress_percent?: number | string | null;
  nextRetargetHeight?: number | string | null;
  next_retarget_height?: number | string | null;
  poolDifficulty?: number | string | null;
  pool_difficulty?: number | string | null;
  networkDifficulty?: number | string | null;
  network_difficulty?: number | string | null;
  difficulty?: number | string | null;
  [key: string]: unknown;
}

export interface NormalizedDifficultyAdjustment {
  estimatedChangePercent?: number;
  estimatedRetargetDate?: number;
  progressPercent?: number;
  nextRetargetHeight?: number;
}

export function normalizeLuxorDifficultyData(
  payload: LuxorDifficultyAdjustmentPayload | null | undefined,
): NormalizedDifficultyAdjustment {
  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return undefined;
  };

  const toTimestamp = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return undefined;
  };

  const estimatedChangePercent = toNumber(
    payload?.difficultyAdjustment ??
      payload?.difficulty_change ??
      payload?.difficultyChange ??
      payload?.poolDifficulty ??
      payload?.pool_difficulty ??
      payload?.networkDifficulty ??
      payload?.network_difficulty ??
      payload?.difficulty,
  );

  const estimatedRetargetDate = toTimestamp(
    payload?.estimatedRetargetDate ?? payload?.estimated_retarget_date,
  );

  const progressPercent = toNumber(
    payload?.progressPercent ?? payload?.progress_percent,
  );

  const nextRetargetHeight = toNumber(
    payload?.nextRetargetHeight ?? payload?.next_retarget_height,
  );

  return {
    estimatedChangePercent,
    estimatedRetargetDate,
    progressPercent,
    nextRetargetHeight,
  };
}
