export type LotValuationMode = "percentage" | "per_sqm";

export type LotValuation = {
  mode: LotValuationMode;
  percentage: number;
  unitValuePerM2: number;
};

export const DEFAULT_LOT_VALUATION: LotValuation = {
  mode: "percentage",
  percentage: 12,
  unitValuePerM2: 0,
};

export function normalizeLotValuation(value: unknown): LotValuation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_LOT_VALUATION };
  }
  const input = value as Partial<LotValuation>;
  return {
    mode: input.mode === "per_sqm" ? "per_sqm" : "percentage",
    percentage: nonNegativeFinite(input.percentage, DEFAULT_LOT_VALUATION.percentage),
    unitValuePerM2: nonNegativeFinite(input.unitValuePerM2, DEFAULT_LOT_VALUATION.unitValuePerM2),
  };
}

export function lotValueForArea(
  areaM2: number,
  baseValue: number,
  includedInLot: boolean | undefined,
  valuation: LotValuation,
) {
  if (!includedInLot) return 0;
  const value = valuation.mode === "per_sqm"
    ? areaM2 * valuation.unitValuePerM2
    : baseValue * (valuation.percentage / 100);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nonNegativeFinite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
