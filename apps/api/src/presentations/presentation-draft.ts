import { BadRequestException } from "@nestjs/common";

export const DRAFT_FIELDS = ["societa", "comune", "indirizzo", "foglioParticellaSub", "categoria",
  "renditaAttuale", "renditaAttribuibile", "imuAttuale", "imuOttenibile"];

// Draft values intentionally remain strings: incomplete edits must survive reopening.
export function validateDraftChanges(input: unknown, propertyIds: Set<string>) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequestException("Modifiche non valide");
  const changes = (input as { changes?: unknown }).changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || Object.keys(changes).length > 20000)
    throw new BadRequestException("Modifiche non valide");
  const result: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(changes)) {
    const separator = key.lastIndexOf(":"), id = key.slice(0, separator), field = key.slice(separator + 1);
    if (key !== "clientName" && (!DRAFT_FIELDS.includes(field) || (!propertyIds.has(id) && value !== null)))
      throw new BadRequestException("Campo o immobile non appartenente alla presentazione");
    if (value !== null && (typeof value !== "string" || value.length > 1000))
      throw new BadRequestException("Valore della bozza non valido (massimo 1000 caratteri)");
    result[key] = value as string | null;
  }
  return result;
}

export function mergeDraftChanges(existing: Record<string, string>, changes: Record<string, string | null>) {
  const result = { ...existing };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete result[key];
    else result[key] = value;
  }
  return result;
}
