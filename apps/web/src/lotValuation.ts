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

export type ResolvedLotValuation = LotValuation & {
  lotAreaM2: number;
  destinationValue: number;
  lotValue: number;
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

export function resolveLotValuation(
  value: unknown,
  lotAreaM2: number,
  destinationValue: number,
): ResolvedLotValuation {
  const valuation = normalizeLotValuation(value);
  const normalizedLotArea = nonNegativeFinite(lotAreaM2, 0);
  const normalizedDestinationValue = nonNegativeFinite(destinationValue, 0);

  if (valuation.mode === "per_sqm") {
    const lotValue = roundCurrency(normalizedLotArea * valuation.unitValuePerM2);
    return {
      ...valuation,
      percentage:
        normalizedDestinationValue > 0
          ? roundRate((lotValue / normalizedDestinationValue) * 100)
          : 0,
      lotAreaM2: normalizedLotArea,
      destinationValue: normalizedDestinationValue,
      lotValue,
    };
  }

  const lotValue = roundCurrency(normalizedDestinationValue * (valuation.percentage / 100));
  return {
    ...valuation,
    unitValuePerM2:
      normalizedLotArea > 0
        ? roundRate(lotValue / normalizedLotArea)
        : 0,
    lotAreaM2: normalizedLotArea,
    destinationValue: normalizedDestinationValue,
    lotValue,
  };
}

export function lotValueShare(
  baseValue: number,
  areaM2: number,
  includedInLot: boolean | undefined,
  totals: {
    lotValue: number;
    selectedDestinationValue: number;
    selectedAreaM2: number;
    selectedCount: number;
  },
) {
  if (!includedInLot || totals.lotValue <= 0) return 0;
  if (totals.selectedDestinationValue > 0) {
    return roundCurrency(totals.lotValue * (baseValue / totals.selectedDestinationValue));
  }
  if (totals.selectedAreaM2 > 0) {
    return roundCurrency(totals.lotValue * (areaM2 / totals.selectedAreaM2));
  }
  return totals.selectedCount > 0
    ? roundCurrency(totals.lotValue / totals.selectedCount)
    : 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRate(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function nonNegativeFinite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
