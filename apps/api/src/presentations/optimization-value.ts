// Positive is the operator's outcome, not the arithmetic sign of the saving.
// Presentation overrides affect this metric only, never the saved editor estimates.
export function optimizationValue(properties: Array<{
  id: string; outcome?: string; currentRendita: number; estimatedRendita: number;
}>, overrides: Record<string, unknown> = {}): number | null {
  let cents = 0;
  for (const property of properties) {
    if (property.outcome !== "Positivo") continue;
    const current = amount(overrides[`${property.id}:renditaAttuale`] ?? property.currentRendita);
    const estimated = amount(overrides[`${property.id}:renditaAttribuibile`] ?? property.estimatedRendita);
    if (current === null || estimated === null) return null;
    cents += current - estimated;
  }
  return cents / 100;
}

function amount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "string" ? Number(value.trim().replace(",", ".")) : value;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round((parsed + 1e-9) * 100) : null;
}
