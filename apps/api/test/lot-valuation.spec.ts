import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LOT_VALUATION,
  calculateAreaValuation,
  normalizeLotValuation,
  selectionIsIncludedInLot,
} from "../../web/src/lotValuation.js";

test("aggiunge il valore del lotto in percentuale al valore della destinazione", () => {
  const result = calculateAreaValuation({
    areaM2: 100,
    destinationRate: 800,
    includedInLot: true,
    lotValuation: { mode: "percentage", value: 12 },
  });
  assert.deepEqual(result, {
    calculatedDestinationAmount: 80_000,
    destinationAmount: 80_000,
    lotAmount: 9_600,
    totalAmount: 89_600,
  });
});

test("calcola il lotto al metro quadro solo per le aree spuntate", () => {
  const included = calculateAreaValuation({
    areaM2: 250,
    destinationRate: 500,
    includedInLot: true,
    lotValuation: { mode: "per-square-meter", value: 60 },
  });
  const excluded = calculateAreaValuation({
    areaM2: 250,
    destinationRate: 500,
    includedInLot: false,
    lotValuation: { mode: "per-square-meter", value: 60 },
  });
  assert.equal(included.lotAmount, 15_000);
  assert.equal(included.totalAmount, 140_000);
  assert.equal(excluded.lotAmount, 0);
  assert.equal(excluded.totalAmount, 125_000);
});

test("applica la percentuale al valore destinazione manuale", () => {
  const result = calculateAreaValuation({
    areaM2: 100,
    destinationRate: 800,
    destinationAmountOverride: 90_000,
    includedInLot: true,
    lotValuation: { mode: "percentage", value: 10 },
  });
  assert.equal(result.destinationAmount, 90_000);
  assert.equal(result.lotAmount, 9_000);
  assert.equal(result.totalAmount, 99_000);
});

test("normalizza configurazioni non valide e riconosce i lotti legacy", () => {
  assert.deepEqual(normalizeLotValuation({ mode: "invalid", value: -5 }), DEFAULT_LOT_VALUATION);
  assert.equal(selectionIsIncludedInLot({ usageId: "lotto" }), true);
  assert.equal(selectionIsIncludedInLot({ usageId: "lotto", includedInLot: false }), false);
});
