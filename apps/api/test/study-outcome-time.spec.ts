import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { formatStudyOutcomeDate } from "../../web/src/study-outcome-date.js";
import { resolveStudyOutcomeDate } from "../src/studies/study-outcome.js";

test("outcome storage declares a millisecond timestamp, never a DATE", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /concludedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/);
});

test("outcome display uses Italian local time in summer and winter, with seconds", () => {
  assert.equal(formatStudyOutcomeDate("2026-09-23T13:42:18.456Z"), "23/09/2026, 15:42:18");
  assert.equal(formatStudyOutcomeDate("2026-01-23T13:42:18.456Z"), "23/01/2026, 14:42:18");
  assert.equal(formatStudyOutcomeDate("2026-09-23T23:42:18.456Z"), "24/09/2026, 01:42:18");
  assert.equal(formatStudyOutcomeDate("2026-10-25T00:30:00Z"), "25/10/2026, 02:30:00");
  assert.equal(formatStudyOutcomeDate("2026-10-25T01:30:00Z"), "25/10/2026, 02:30:00");
  assert.equal(formatStudyOutcomeDate("2026-09-23"), "23/09/2026");
  assert.equal(formatStudyOutcomeDate(null), "Non registrata");
  assert.equal(formatStudyOutcomeDate("invalid"), "Non registrata");
});

test("outcome changes and ERP offsets preserve the exact instant; no-op sync keeps it", () => {
  for (const [value, expected] of [
    ["2026-09-23T15:42:18.456+02:00", "2026-09-23T13:42:18.456Z"],
    ["2026-01-23T15:42:18.456+01:00", "2026-01-23T14:42:18.456Z"],
  ]) {
    const supplied = new Date(value);
    const saved = resolveStudyOutcomeDate({ previousStatus: "Aperta", nextStatus: "Positiva", suppliedDate: supplied, suppliedDateProvided: true });
    assert.equal(saved?.toISOString(), expected);
    assert.equal(resolveStudyOutcomeDate({ previousStatus: "Positiva", nextStatus: "Positiva", currentDate: saved, suppliedDate: null, suppliedDateProvided: true })?.toISOString(), expected);
    assert.equal(resolveStudyOutcomeDate({ previousStatus: "Positiva", nextStatus: "Sospesa", now: supplied })?.toISOString(), expected);
  }
});
