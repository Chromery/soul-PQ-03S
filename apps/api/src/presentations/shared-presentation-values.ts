// Per-property presentation values are shared between a study and its portfolio.
// Deck settings, grouping and captions of merged rows remain local to each draft.
export const SHARED_PRESENTATION_FIELDS = new Set([
  "societa", "comune", "indirizzo", "foglioParticellaSub", "categoria",
  "renditaAttuale", "renditaAttribuibile", "imuAttuale", "imuOttenibile", "reductionBasis", "highlight",
]);
export type DraftValues = { overrides: unknown } | null | undefined;
export function sharedPropertyId(key: string) {
  const separator = key.lastIndexOf(":");
  const id = key.slice(0, separator);
  return separator > 0 && !id.startsWith("group:") && SHARED_PRESENTATION_FIELDS.has(key.slice(separator + 1)) ? id : null;
}
export function draftValues(draft: DraftValues): Record<string, string> {
  return draft?.overrides && typeof draft.overrides === "object" && !Array.isArray(draft.overrides)
    ? draft.overrides as Record<string, string> : {};
}
export function sharedValues(draft: DraftValues, ids: Set<string>) {
  return Object.fromEntries(Object.entries(draftValues(draft)).filter(([key]) => ids.has(sharedPropertyId(key) ?? "")));
}
// Match decimal input accepted by the presentation, including Italian thousands.
// Incomplete edits stay in the draft but must never become a financial value.
export function presentationRent(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/.test(text)) return null;
  const normalized = text.includes(",") ? text.replaceAll(".", "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replaceAll(".", "") : text;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 && amount < 1e12 ? Math.round(amount * 100) / 100 : null;
}
export function manualPresentationRent(id: string, study: DraftValues, group?: DraftValues) {
  const key = `${id}:renditaAttribuibile`;
  return presentationRent(draftValues(study)[key] ?? draftValues(group)[key]);
}
