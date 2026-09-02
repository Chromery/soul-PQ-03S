export const STUDY_OUTCOMES = [
  "Aperta",
  "Annullata",
  "Negativa",
  "Positiva",
  "Sospesa",
] as const;

export type StudyOutcome = (typeof STUDY_OUTCOMES)[number];

type ResolveStudyOutcomeDateInput = {
  previousStatus?: string | null;
  nextStatus: string;
  currentDate?: Date | null;
  suppliedDate?: Date | null;
  suppliedDateProvided?: boolean;
  now?: Date;
};

export function normalizeStudyOutcome(value?: string | null): StudyOutcome {
  const normalized = value
    ?.trim()
    .toLocaleLowerCase("it-IT")
    .replace(/[\s-]+/g, "_");

  if (normalized === "annullata" || normalized === "annullato" || normalized === "archiviato") {
    return "Annullata";
  }
  if (normalized === "negativa" || normalized === "negativo") return "Negativa";
  if (normalized === "positiva" || normalized === "positivo" || normalized === "concluso") {
    return "Positiva";
  }
  if (normalized === "sospesa" || normalized === "sospeso" || normalized === "in_revisione") {
    return "Sospesa";
  }
  if (
    normalized === "aperta"
    || normalized === "aperto"
    || normalized === "da_iniziare"
    || normalized === "in_progress"
    || normalized === "in_lavorazione"
  ) {
    return "Aperta";
  }
  return "Aperta";
}

export function isTerminalStudyOutcome(value?: string | null) {
  const outcome = normalizeStudyOutcome(value);
  return outcome === "Annullata" || outcome === "Negativa" || outcome === "Positiva";
}

export function resolveStudyOutcomeDate(input: ResolveStudyOutcomeDateInput): Date | null {
  const nextStatus = normalizeStudyOutcome(input.nextStatus);
  const previousStatus = input.previousStatus === undefined || input.previousStatus === null
    ? null
    : normalizeStudyOutcome(input.previousStatus);
  const changed = previousStatus !== null && previousStatus !== nextStatus;

  if (changed) return input.suppliedDate ?? input.now ?? new Date();
  if (input.suppliedDateProvided) return input.suppliedDate ?? null;
  if (previousStatus === null && nextStatus !== "Aperta") return input.now ?? new Date();
  return input.currentDate ?? null;
}
