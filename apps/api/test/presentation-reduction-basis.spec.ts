import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { groupPresentationRows, presentationGroupKeys } from "../src/presentations/presentation-grouping.js";
import { validateDraftChanges, mergeDraftChanges } from "../src/presentations/presentation-draft.js";
import { PresentationsService } from "../src/presentations/presentations.service.js";

const properties = ["1", "2", "3"].map(id => ({ id, societa: "Società campione", comune: "Milano (MI)",
  indirizzo: "Via Roma 44", categoria: "D/8", foglioParticellaSub: `Fg. 11 - Part. 7 - Sub. ${id}`,
  renditaAttuale: 100, renditaAttribuibile: 80, imuAttuale: 100, imuOttenibile: 50 }));
const sources = [{ id: "1", valuationGroupId: "g1" }, { id: "2", valuationGroupId: "g1" }, { id: "3" }];

test("reduction flags are validated, scoped, resettable and independent for members/groups", () => {
  const ids = new Set(properties.map(p => p.id)), keys = presentationGroupKeys(sources, {});
  for (const changes of [{ "foreign:reductionBasis": "imu" }, { "group:valuation:foreign:reductionBasis": "imu" },
    { "1:reductionBasis": "garbage" }, { "1:reductionBasis": true }, { "group:valuation:g1:reductionBasis": "" }])
    assert.throws(() => validateDraftChanges({ changes }, ids, keys));
  const before = structuredClone(properties);
  const flags = mergeDraftChanges({}, validateDraftChanges({ changes: { "1:reductionBasis": "imu", "3:reductionBasis": "imu" } }, ids, keys));
  assert.deepEqual(groupPresentationRows(properties, sources, flags).map(p => p.reductionBasis), ["rent", "imu"]);
  const grouped = mergeDraftChanges(flags, validateDraftChanges({ changes: { "group:valuation:g1:reductionBasis": "imu" } }, ids, keys));
  assert.deepEqual(groupPresentationRows(properties, sources, grouped).map(p => p.reductionBasis), ["imu", "imu"]);
  assert.equal(groupPresentationRows([properties[1]], sources, grouped)[0].reductionBasis, "imu");
  assert.deepEqual(groupPresentationRows(properties, sources, { ...grouped, "1:presentationGroup": "", "2:presentationGroup": "" }).map(p => p.reductionBasis), ["imu", "rent", "imu"]);
  const reset = mergeDraftChanges(grouped, validateDraftChanges({ changes: { "group:valuation:g1:reductionBasis": null, "3:reductionBasis": null } }, ids, keys));
  assert.deepEqual(groupPresentationRows(properties, sources, reset).map(p => p.reductionBasis), ["rent", "rent"]);
  assert.deepEqual(properties, before);
});

test("new PDF uses rent by default, IMU only per flagged row, uniform heading and rent-based portfolio total", {
  skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, timeout: 90000,
}, async () => {
  const service = new PresentationsService({} as never, {} as never, {} as never, { get: (_: string, fallback: unknown) => fallback } as never);
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 990 } });
  const snapshot: any = { version: 3, reductionBasis: "per-row", generatedAt: new Date().toISOString(),
    studio: { id: "qa", company: "Società campione", comune: "Milano", provincia: "MI", vat: "", commercialOwner: "", technicalOwner: "" },
    immobili: properties, tableRows: groupPresentationRows(properties, sources, { "group:valuation:g1:reductionBasis": "imu" }) };
  const render = async () => { await page.goto("about:blank"); await page.setContent(await (service as any).renderSnapshot(snapshot), { waitUntil: "networkidle" }); };
  try {
    await render();
    assert.equal(await page.locator("#properties-card th:last-child").textContent(), "% RID.");
    assert.deepEqual(await page.locator("#property-rows td:last-child").allTextContents(), ["50%", "20%"]);
    assert.equal(await page.locator("#property-totals td:last-child").innerText(), "20%");
    assert.doesNotMatch(await page.locator("#properties-card").innerText(), /Considera|RIDUZIONE IMU|per IMU/);
    if (process.env.PQ_GROUPING_REVIEW_DIR) await page.locator("#slide-5").screenshot({ path: `${process.env.PQ_GROUPING_REVIEW_DIR}/per-row-reduction.png` });
    for (const [current, estimated, expected] of [[0, 0, "n.d."], [null, 0, "n.d."], [100, null, "n.d."], [100, 125, "-25%"], [100, 0, "100%"]]) {
      snapshot.tableRows = [{ ...properties[0], reductionBasis: "imu", imuAttuale: current, imuOttenibile: estimated }];
      await render(); assert.equal(await page.locator("#property-rows td:last-child").innerText(), expected);
    }
    snapshot.tableRows = [{ ...properties[0], renditaAttuale: 0, reductionBasis: "rent" }];
    await render(); assert.equal(await page.locator("#property-rows td:last-child").innerText(), "n.d.");
  } finally { await browser.close(); await service.onModuleDestroy(); }
});
