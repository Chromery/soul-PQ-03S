import assert from "node:assert/strict";
import test from "node:test";
import { cadastralMultiplierForCategory, ImuCalculator } from "../src/imu/imu-calculator.js";
import type { ImuRateRecord } from "../src/imu/imu.types.js";

const records: ImuRateRecord[] = [
  rateRecord({ year: 2025, groupDRate: 1, ruralInstrumentalRate: 0.1, otherBuildingsRate: 0.96 }),
  rateRecord({ year: 2026, municipality: "Comune Nuovo", groupDRate: 1.06 }),
];

test("calcola l'IMU annua rivalutando la rendita e usando il moltiplicatore D", () => {
  const result = new ImuCalculator(records).calculate({
    rendita: 10_000,
    categoria: "D/7",
    comune: "Comune Nuovo",
    provincia: "MI",
  });
  assert.equal(result.status, "calculated");
  if (result.status !== "calculated") return;
  assert.equal(result.taxableBase, 682_500);
  assert.equal(result.amount, 7_234.5);
  assert.equal(result.rateYear, 2026);
  assert.equal(result.usedFallback, false);
  assert.equal(result.sourceUrl, `/api/imu/delibere/${"a".repeat(64)}`);
});

test("fa fallback al 2025 quando il comune non ha una delibera 2026", () => {
  const result = new ImuCalculator(records).calculate({
    rendita: 1_000,
    categoria: "D10",
    comune: "Comune Test",
    provincia: "MI",
  });
  assert.equal(result.status, "calculated");
  if (result.status !== "calculated") return;
  assert.equal(result.amount, 68.25);
  assert.equal(result.rateYear, 2025);
  assert.equal(result.usedFallback, true);
  assert.equal(result.rateKind, "rural_instrumental");
});

test("non indovina aliquote da delibere libere non strutturate", () => {
  const custom = rateRecord({ documentType: "municipal_resolution", year: 2026 });
  const result = new ImuCalculator([custom]).calculate({
    rendita: 1_000,
    categoria: "D/7",
    comune: "Comune Test",
    provincia: "MI",
  });
  assert.deepEqual(result, { status: "unavailable", reason: "unsupported_document", targetYear: 2026 });
});

test("usa i moltiplicatori catastali previsti per le categorie principali", () => {
  assert.equal(cadastralMultiplierForCategory("A/2"), 160);
  assert.equal(cadastralMultiplierForCategory("A10"), 80);
  assert.equal(cadastralMultiplierForCategory("B/4"), 140);
  assert.equal(cadastralMultiplierForCategory("C/1"), 55);
  assert.equal(cadastralMultiplierForCategory("C/2"), 160);
  assert.equal(cadastralMultiplierForCategory("C3"), 140);
  assert.equal(cadastralMultiplierForCategory("D/5"), 80);
  assert.equal(cadastralMultiplierForCategory("D7"), 65);
  assert.equal(cadastralMultiplierForCategory("ZONA1CAT.C/6"), 160);
  assert.equal(cadastralMultiplierForCategory("ZONA9CAT.D/2"), 65);
  assert.equal(cadastralMultiplierForCategory("ZONA1D/8"), 65);
  assert.equal(cadastralMultiplierForCategory("F/1"), null);
});

test("applica l'aliquota manuale conservando quella comunale di sistema", () => {
  const result = new ImuCalculator(records).calculate({
    rendita: 10_000,
    categoria: "ZONA3CAT.D/7",
    comune: "Comune Nuovo",
    provincia: "MI",
    rateOverridePercent: 0.92,
  });
  assert.equal(result.status, "calculated");
  if (result.status !== "calculated") return;
  assert.equal(result.cadastralMultiplier, 65);
  assert.equal(result.systemCadastralMultiplier, 65);
  assert.equal(result.cadastralMultiplierOverridden, false);
  assert.equal(result.systemRatePercent, 1.06);
  assert.equal(result.ratePercent, 0.92);
  assert.equal(result.rateOverridden, true);
  assert.equal(result.amount, 6_279);
});

test("consente un'aliquota manuale anche quando non esiste un valore comunale strutturato", () => {
  const result = new ImuCalculator([]).calculate({
    rendita: 1_000,
    categoria: "C/1",
    comune: "Comune senza prospetto",
    provincia: "RM",
    rateOverridePercent: 1,
  });
  assert.equal(result.status, "calculated");
  if (result.status !== "calculated") return;
  assert.equal(result.systemRatePercent, null);
  assert.equal(result.ratePercent, 1);
  assert.equal(result.rateOverridden, true);
  assert.equal(result.amount, 577.5);
});

test("applica un moltiplicatore manuale conservando quello ufficiale della categoria", () => {
  const result = new ImuCalculator(records).calculate({
    rendita: 1_000,
    categoria: "ZONA1CAT.D/7",
    comune: "Comune Nuovo",
    provincia: "MI",
    cadastralMultiplierOverride: 70,
  });
  assert.equal(result.status, "calculated");
  if (result.status !== "calculated") return;
  assert.equal(result.systemCadastralMultiplier, 65);
  assert.equal(result.cadastralMultiplier, 70);
  assert.equal(result.cadastralMultiplierOverridden, true);
  assert.equal(result.taxableBase, 73_500);
  assert.equal(result.amount, 779.1);
});

test("consente un moltiplicatore manuale per una categoria senza coefficiente ufficiale", () => {
  const result = new ImuCalculator(records).calculate({
    rendita: 1_000,
    categoria: "F/1",
    comune: "Comune Test",
    provincia: "MI",
    cadastralMultiplierOverride: 100,
  });
  assert.equal(result.status, "calculated");
  if (result.status !== "calculated") return;
  assert.equal(result.systemCadastralMultiplier, null);
  assert.equal(result.cadastralMultiplier, 100);
  assert.equal(result.cadastralMultiplierOverridden, true);
  assert.equal(result.amount, 1_008);
});

function rateRecord(overrides: Partial<ImuRateRecord>): ImuRateRecord {
  return {
    cadastralCode: "X001",
    municipality: "Comune Test",
    province: "MI",
    region: "Lombardia",
    year: 2025,
    documentType: "mef_standard_prospect",
    groupDRate: 1,
    ruralInstrumentalRate: 0.1,
    otherBuildingsRate: 0.96,
    actNumber: "1",
    actDate: "01/01/2025",
    publicationDate: "02/01/2025",
    sourcePath: "delibere/X001/atto.pdf",
    sha256: "a".repeat(64),
    ...overrides,
  };
}
