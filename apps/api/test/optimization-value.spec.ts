import assert from "node:assert/strict";
import test from "node:test";
import { optimizationValue } from "../src/presentations/optimization-value.js";

const positives = [
  { id: "a", outcome: "Positivo", currentRendita: 1000.12, estimatedRendita: 800.10 },
  { id: "b", outcome: "Positivo", currentRendita: 500.33, estimatedRendita: 550.40 },
];
test("optimization uses outcome, cents, overrides and never partial invalid totals", () => {
  const others = ["Negativo", "Neutro", "Sospeso"].map((outcome, i) => ({
    id: `other-${i}`, outcome, currentRendita: 90000, estimatedRendita: 0,
  }));
  assert.equal(optimizationValue([...positives, ...others]), 149.95);
  assert.equal(optimizationValue(others), 0);
  assert.equal(optimizationValue([]), 0);
  assert.equal(optimizationValue(positives, { "a:renditaAttribuibile": "1000,12" }), -50.07);
  assert.equal(optimizationValue(positives, { "a:renditaAttribuibile": "" }), null);
  assert.equal(optimizationValue(positives, { "a:renditaAttuale": "invalid" }), null);
  assert.equal(optimizationValue(positives, { "a:renditaAttuale": "-1" }), null);
  assert.equal(optimizationValue([...positives, ...others], { "other-0:renditaAttuale": "" }), 149.95);
  assert.equal(optimizationValue(positives, { "a:imuAttuale": "invalid" }), 149.95);
  assert.equal(optimizationValue([{ ...positives[0], outcome: "Neutro" }]), 0);
});
