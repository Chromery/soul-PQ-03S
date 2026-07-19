export type LotValuationMode = "percentage" | "per-square-meter";

export type LotValuation = {
  mode: LotValuationMode;
  value: number;
};

export type AreaValuation = {
  destinationAmount: number;
  calculatedDestinationAmount: number;
  lotAmount: number;
  totalAmount: number;
};

export const DEFAULT_LOT_VALUATION: LotValuation = {
  mode: "percentage",
  value: 12,
};

export function normalizeLotValuation(value: unknown): LotValuation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_LOT_VALUATION };
  }
  const candidate = value as Partial<LotValuation>;
  const mode = candidate.mode === "per-square-meter" ? candidate.mode : "percentage";
  const amount =
    typeof candidate.value === "number" && Number.isFinite(candidate.value) && candidate.value >= 0
      ? candidate.value
      : DEFAULT_LOT_VALUATION.value;
  return { mode, value: amount };
}

export function selectionIsIncludedInLot(selection: {
  includedInLot?: boolean;
  usageId?: string;
}) {
  if (typeof selection.includedInLot === "boolean") return selection.includedInLot;
  return selection.usageId === "lotto";
}

export function calculateAreaValuation({
  areaM2,
  destinationRate,
  destinationAmountOverride,
  includedInLot,
  lotValuation,
}: {
  areaM2: number;
  destinationRate: number;
  destinationAmountOverride?: number | null;
  includedInLot: boolean;
  lotValuation: LotValuation;
}): AreaValuation {
  const calculatedDestinationAmount = areaM2 * destinationRate;
  const destinationAmount =
    typeof destinationAmountOverride === "number" && Number.isFinite(destinationAmountOverride)
      ? destinationAmountOverride
      : calculatedDestinationAmount;
  const lotAmount = !includedInLot
    ? 0
    : lotValuation.mode === "per-square-meter"
      ? areaM2 * lotValuation.value
      : destinationAmount * (lotValuation.value / 100);
  return {
    destinationAmount,
    calculatedDestinationAmount,
    lotAmount,
    totalAmount: destinationAmount + lotAmount,
  };
}
