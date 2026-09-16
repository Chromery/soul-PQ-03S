import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { groupPresentationRows, presentationGroupKeys } from "../src/presentations/presentation-grouping.js";
import { validateDraftChanges } from "../src/presentations/presentation-draft.js";
import { PresentationsService } from "../src/presentations/presentations.service.js";

const sources = [{ id: "1", valuationGroupId: "g1" }, { id: "2", valuationGroupId: "g1" }];
const properties = ["1", "2"].map((id, index) => ({ id, societa: "Società campione", comune: "Scandicci (FI)",
  indirizzo: `Via campione ${index + 1}`, categoria: index ? "D8" : "D/8 ", foglioParticellaSub: `Fg. 11 - Part. 7 - Sub. ${id}`,
  renditaAttuale: 100, renditaAttribuibile: 100, imuAttuale: 100, imuOttenibile: 50 }));

test("group captions are separate, normalized, owner-scoped and never alter members or sums", () => {
  const before = structuredClone(properties);
  const keys = presentationGroupKeys(sources, {});
  const changes = validateDraftChanges({ changes: { "group:valuation:g1:indirizzo": "Complesso immobiliare", "group:valuation:g1:categoria": "D/4" } }, new Set(["1", "2"]), keys) as Record<string, string>;
  const result = groupPresentationRows(properties, sources, changes)[0];
  assert.equal(result.indirizzo, "Complesso immobiliare"); assert.equal(result.categoria, "D/4");
  assert.equal(result.renditaAttuale, 200); assert.deepEqual(properties, before);
  assert.equal(groupPresentationRows(properties, sources, {})[0].categoria, "D/8");
  assert.equal(groupPresentationRows([properties[0]], sources, changes)[0].indirizzo, "Complesso immobiliare");
  const dissolved = groupPresentationRows(properties, sources, { ...changes, "1:presentationGroup": "", "2:presentationGroup": "" });
  assert.equal(dissolved[0].indirizzo, properties[0].indirizzo);
  for (const changes of [{ "group:valuation:foreign:indirizzo": "No" }, { "group:valuation:g1:renditaAttuale": "1" }, { "group:valuation:g1:presentationGroup": "manual:x" }])
    assert.throws(() => validateDraftChanges({ changes }, new Set(["1", "2"]), keys));
  const manualKeys = presentationGroupKeys(sources, { "1:presentationGroup": "manual:m1", "2:presentationGroup": "manual:m1" });
  assert.ok(manualKeys.has("group:manual:m1"));
});

test("new V3 percent is IMU-based: zero rent saving, weighted totals, missing/zero IMU and immutable legacy", {
  skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, timeout: 90000,
}, async () => {
  const service = new PresentationsService({} as never, {} as never, {} as never, { get: (_: string, fallback: unknown) => fallback } as never);
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 990 } });
  const row = { ...properties[0], renditaAttuale: 14493.33, renditaAttribuibile: 14493.33, imuAttuale: 25809.72, imuOttenibile: 9693.86 };
  const snapshot: any = { version: 3, reductionBasis: "imu", generatedAt: new Date().toISOString(),
    studio: { id: "qa", company: "Società campione", comune: "Scandicci", provincia: "FI", vat: "", commercialOwner: "", technicalOwner: "" }, immobili: [row] };
  const render = async () => { await page.goto("about:blank"); await page.setContent(await (service as any).renderSnapshot(snapshot), { waitUntil: "networkidle" }); };
  try {
    await render();
    assert.match(await page.locator("#properties-card th:last-child").textContent() ?? "", /Riduzione IMU %/);
    assert.match(await page.locator("#property-rows td:last-child").innerText(), /62,4/);
    assert.match(await page.locator("#property-totals td:last-child").innerText(), /62,4/);
    if (process.env.PQ_GROUPING_REVIEW_DIR) await page.locator("#slide-5").screenshot({ path: `${process.env.PQ_GROUPING_REVIEW_DIR}/imu-reduction.png` });
    snapshot.immobili = [row, { ...properties[1], imuAttuale: 100, imuOttenibile: 0 }];
    await render();
    const expected = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1 }).format((25809.72 + 100 - 9693.86) / (25809.72 + 100));
    assert.equal(await page.locator("#property-totals td:last-child").innerText(), expected);
    for (const pair of [[0, 0], [null, 0], [100, null]]) {
      snapshot.immobili = [{ ...row, imuAttuale: pair[0], imuOttenibile: pair[1] }]; await render();
      assert.equal(await page.locator("#property-rows td:last-child").innerText(), "n.d.");
      assert.equal(await page.locator("#property-totals td:last-child").innerText(), "n.d.");
    }
    snapshot.immobili = [{ ...row, imuAttuale: 100, imuOttenibile: 125 }]; await render();
    assert.match(await page.locator("#property-rows td:last-child").innerText(), /-25/);
    delete snapshot.reductionBasis; snapshot.immobili = [row]; await render();
    assert.equal(await page.locator("#property-rows td:last-child").innerText(), "0%");
    assert.equal(await page.locator("#properties-card th:last-child").textContent(), "% rid.");
  } finally { await browser.close(); await service.onModuleDestroy(); }
});
