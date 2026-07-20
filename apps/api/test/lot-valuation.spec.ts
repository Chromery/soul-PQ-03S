import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LOT_VALUATION,
  lotValueForArea,
  normalizeLotValuation,
} from "../../web/src/lotValuation.ts";

test("il lotto percentuale si somma al valore della destinazione selezionata", () => {
  const lotValue = lotValueForArea(100, 720, true, DEFAULT_LOT_VALUATION);

  assert.equal(lotValue, 86.4);
  assert.equal(720 + lotValue, 806.4);
});

test("il lotto a metro quadro usa la superficie dell'area selezionata", () => {
  const lotValue = lotValueForArea(100, 720, true, {
    mode: "per_sqm",
    percentage: 12,
    unitValuePerM2: 50,
  });

  assert.equal(lotValue, 5000);
  assert.equal(720 + lotValue, 5720);
});

test("un'area senza check lotto non riceve alcuna quota", () => {
  assert.equal(lotValueForArea(100, 720, false, DEFAULT_LOT_VALUATION), 0);
});

test("le bozze precedenti ricevono il fallback percentuale del 12%", () => {
  assert.deepEqual(normalizeLotValuation(undefined), DEFAULT_LOT_VALUATION);
});
