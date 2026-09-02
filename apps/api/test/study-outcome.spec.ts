import assert from "node:assert/strict";
import test from "node:test";
import {
  isTerminalStudyOutcome,
  normalizeStudyOutcome,
  resolveStudyOutcomeDate,
  STUDY_OUTCOMES,
} from "../src/studies/study-outcome.js";

test("gli esiti studio canonici coincidono con quelli ERP", () => {
  assert.deepEqual(STUDY_OUTCOMES, ["Aperta", "Annullata", "Negativa", "Positiva", "Sospesa"]);
  assert.equal(normalizeStudyOutcome("aperta"), "Aperta");
  assert.equal(normalizeStudyOutcome("NEGATIVA"), "Negativa");
  assert.equal(normalizeStudyOutcome("Sospesa"), "Sospesa");
  assert.equal(isTerminalStudyOutcome("Positiva"), true);
  assert.equal(isTerminalStudyOutcome("Sospesa"), false);
});

test("i vecchi stati sono normalizzati senza interrompere il sync", () => {
  assert.equal(normalizeStudyOutcome("da_iniziare"), "Aperta");
  assert.equal(normalizeStudyOutcome("in_progress"), "Aperta");
  assert.equal(normalizeStudyOutcome("In lavorazione"), "Aperta");
  assert.equal(normalizeStudyOutcome("In revisione"), "Sospesa");
  assert.equal(normalizeStudyOutcome("Concluso"), "Positiva");
  assert.equal(normalizeStudyOutcome("annullato"), "Annullata");
});

test("la data esito viene aggiornata a ogni cambio di esito", () => {
  const previousDate = new Date("2026-08-20T00:00:00.000Z");
  const now = new Date("2026-09-02T17:10:00.000Z");

  assert.equal(
    resolveStudyOutcomeDate({
      previousStatus: "Aperta",
      nextStatus: "Positiva",
      currentDate: previousDate,
      now,
    }).toISOString(),
    now.toISOString(),
  );
  assert.equal(
    resolveStudyOutcomeDate({
      previousStatus: "Positiva",
      nextStatus: "Negativa",
      currentDate: previousDate,
      now,
    }).toISOString(),
    now.toISOString(),
  );
});

test("il sync conserva la data se l'esito non cambia e rispetta una data esplicita", () => {
  const previousDate = new Date("2026-08-20T00:00:00.000Z");
  const suppliedDate = new Date("2026-09-01T00:00:00.000Z");

  assert.equal(
    resolveStudyOutcomeDate({
      previousStatus: "Sospesa",
      nextStatus: "Sospesa",
      currentDate: previousDate,
    }).toISOString(),
    previousDate.toISOString(),
  );
  assert.equal(
    resolveStudyOutcomeDate({
      previousStatus: "Aperta",
      nextStatus: "Negativa",
      currentDate: previousDate,
      suppliedDate,
      suppliedDateProvided: true,
    }).toISOString(),
    suppliedDate.toISOString(),
  );
});
