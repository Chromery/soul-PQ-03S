import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LOT_VALUATION,
  lotValueShare,
  normalizeLotValuation,
  resolveLotValuation,
} from "../../web/src/lotValuation.ts";

test("il lotto percentuale deriva valore totale e valore al metro quadro", () => {
  const valuation = resolveLotValuation(
    { mode: "percentage", percentage: 10, unitValuePerM2: 0 },
    1000,
    10000,
  );

  assert.equal(valuation.lotValue, 1000);
  assert.equal(valuation.unitValuePerM2, 1);
});

test("il lotto a metro quadro deriva valore totale e percentuale", () => {
  const valuation = resolveLotValuation({
    mode: "per_sqm",
    percentage: 0,
    unitValuePerM2: 2,
  }, 1000, 10000);

  assert.equal(valuation.lotValue, 2000);
  assert.equal(valuation.percentage, 20);
});

test("la quota lotto viene ripartita solo tra le destinazioni selezionate", () => {
  const totals = {
    lotValue: 1000,
    selectedDestinationValue: 10000,
    selectedAreaM2: 1000,
    selectedCount: 2,
  };
  assert.equal(lotValueShare(6000, 400, true, totals), 600);
  assert.equal(lotValueShare(4000, 600, true, totals), 400);
  assert.equal(lotValueShare(6000, 400, false, totals), 0);
});

test("le bozze precedenti ricevono il fallback percentuale del 12%", () => {
  assert.deepEqual(normalizeLotValuation(undefined), DEFAULT_LOT_VALUATION);
});
