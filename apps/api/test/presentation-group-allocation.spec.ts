import assert from "node:assert/strict";
import test from "node:test";
import { allocatePresentationTotal } from "../../web/src/presentation-group-allocation.js";
import { imuOverrides } from "../src/imu/imu-overrides.js";

test("presentation group totals allocate exact cents with proportional and fallback weights", () => {
  assert.deepEqual(allocatePresentationTotal(600.60, [100.10, 200.20], [0, 0]), [200.20, 400.40]);
  assert.deepEqual(allocatePresentationTotal(100, [null, null], [1, 3]), [25, 75]);
  assert.deepEqual(allocatePresentationTotal(0.01, [0, 0, 0], [0, 0, 0]), [0.01, 0, 0]);
  assert.deepEqual(allocatePresentationTotal(0, [100, 200], [0, 0]), [0, 0]);
  assert.deepEqual(allocatePresentationTotal(42, [3], [0]), [42]);
  for (let n = 2; n < 100; n++) {
    const result = allocatePresentationTotal(12345.67, Array.from({length:n}, (_, i) => i * 0.13), Array(n).fill(0));
    assert.equal(result.reduce((sum, value) => sum + Math.round(value * 100), 0), 1234567);
    assert.ok(result.every(value => value >= 0));
  }
  assert.throws(() => allocatePresentationTotal(Infinity, [1], [1]));
  assert.throws(() => allocatePresentationTotal(-1, [1], [1]));
});

test("current IMU null resets to system, never to the forecast override; zero survives", () => {
  const property = { imuRateOverride: 1.2, imuMultiplierOverride: 160, currentImuRateOverride: null, currentImuMultiplierOverride: null };
  assert.deepEqual(imuOverrides(property), { rateOverridePercent: 1.2, cadastralMultiplierOverride: 160 });
  assert.deepEqual(imuOverrides(property, true), { rateOverridePercent: null, cadastralMultiplierOverride: null });
  assert.equal(imuOverrides({ ...property, currentImuRateOverride: 0 }, true).rateOverridePercent, 0);
});
