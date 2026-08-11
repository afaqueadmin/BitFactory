import { describe, expect, it } from "vitest";
import { normalizeLuxorDifficultyData } from "../luxorDifficulty";

describe("normalizeLuxorDifficultyData", () => {
  it("maps common Luxor difficulty adjustment fields", () => {
    const result = normalizeLuxorDifficultyData({
      difficultyAdjustment: -2.35,
      estimatedRetargetDate: "2026-08-14T00:00:00.000Z",
      progressPercent: 17.5,
      nextRetargetHeight: 900123,
    });

    expect(result.estimatedChangePercent).toBe(-2.35);
    expect(result.estimatedRetargetDate).toBe(1786665600000);
    expect(result.progressPercent).toBe(17.5);
    expect(result.nextRetargetHeight).toBe(900123);
  });

  it("returns undefined values when the payload does not expose difficulty data", () => {
    const result = normalizeLuxorDifficultyData({
      hashprice: "0.00001234",
    });

    expect(result.estimatedChangePercent).toBeUndefined();
    expect(result.estimatedRetargetDate).toBeUndefined();
    expect(result.progressPercent).toBeUndefined();
  });
});
