import type { PlanAnalysisDraft } from "./generated/prisma/client.js";

export const FRUITFULNESS_RATE = 0.02;

type DraftEstimatePayload = {
  totalEstimatedAmount?: unknown;
  totalEstimatedRendita?: unknown;
  totalBaseAmount?: unknown;
  totalLotValue?: unknown;
};

type DraftWithEstimate = Pick<PlanAnalysisDraft, "payload" | "totalEstimatedValue">;

export function estimatedRenditaFromEstimatedAmount(amount: number) {
  return amount * FRUITFULNESS_RATE;
}

export function estimatedRenditaFromDraftPayload(payload: DraftEstimatePayload, oneri = false) {
  const totalBaseAmount = optionalFiniteNumber(payload.totalBaseAmount);
  const totalLotValue = optionalFiniteNumber(payload.totalLotValue);
  if (totalBaseAmount !== null) {
    return estimatedRenditaFromEstimatedAmount(
      totalBaseAmount * (oneri ? 1.4 : 1) + (totalLotValue ?? 0),
    );
  }

  if (oneri) {
    const estimatedAmount = optionalFiniteNumber(payload.totalEstimatedAmount);
    if (estimatedAmount !== null) {
      const lotValue = totalLotValue ?? 0;
      return estimatedRenditaFromEstimatedAmount(
        Math.max(0, estimatedAmount - lotValue) * 1.4 + lotValue,
      );
    }
  }

  const explicitRendita = optionalFiniteNumber(payload.totalEstimatedRendita);
  if (explicitRendita !== null) return explicitRendita;

  const estimatedAmount = optionalFiniteNumber(payload.totalEstimatedAmount);
  return estimatedAmount === null ? null : estimatedRenditaFromEstimatedAmount(estimatedAmount);
}

export function estimatedRenditaFromAnalysisDraft(
  draft: DraftWithEstimate | null | undefined,
  oneri = false,
) {
  if (!draft) return null;
  const payload = isObject(draft.payload) ? draft.payload : {};
  const estimatedRendita = estimatedRenditaFromDraftPayload(payload, oneri);
  if (estimatedRendita !== null) return estimatedRendita;

  const storedValue = Number(draft.totalEstimatedValue);
  return Number.isFinite(storedValue) ? storedValue : null;
}

function optionalFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
