const outcomeDateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatStudyOutcomeDate(value?: string | null) {
  if (!value) return "Non registrata";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Non registrata";
  // Older date-only fixtures/imports have no known time: do not invent one.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.split("-").reverse().join("/");
  }
  return outcomeDateTimeFormatter.format(date);
}
