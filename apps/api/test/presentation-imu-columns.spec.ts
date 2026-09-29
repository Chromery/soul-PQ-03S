import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { validateDraftChanges, mergeDraftChanges } from "../src/presentations/presentation-draft.js";
import { groupPresentationRows } from "../src/presentations/presentation-grouping.js";
import { PresentationsService } from "../src/presentations/presentations.service.js";

test("IMU visibility is an explicitly validated, resettable presentation-level option", () => {
  for (const value of [true, false, 1, "", "yes", {}, []])
    assert.throws(() => validateDraftChanges({ changes: { showImuColumns: value } }, new Set()));
  for (const value of ["true", "false", null])
    assert.deepEqual(validateDraftChanges({ changes: { showImuColumns: value } }, new Set()), { showImuColumns: value });
  assert.throws(() => validateDraftChanges({ changes: { "foreign:showImuColumns": "true" } }, new Set()));
  assert.deepEqual(mergeDraftChanges({ showImuColumns: "true" }, { showImuColumns: null }), {});
});

test("optional IMU columns preserve defaults, amounts, grouping, unknown values and layout", {
  skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, timeout: 90000,
}, async () => {
  const service = new PresentationsService({} as never, {} as never, {} as never, { get: (_: string, fallback: unknown) => fallback } as never);
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 990 } });
  const properties = ["1", "2", "3"].map((id, i) => ({ id, societa: "GAROFALO HEALTH CARE REAL ESTATE - S.P.A.",
    comune: "Bologna (BO)", indirizzo: "Viale Giambattista Ercolani 9", categoria: "D/4",
    foglioParticellaSub: `Fg. 234 - Part. 123 - Sub. ${id}`, renditaAttuale: 205668.70, renditaAttribuibile: 166231,
    imuAttuale: [53769.80, 80000, 148885.52][i], imuOttenibile: [42368.23, 69990.34, 120354.32][i] }));
  const snapshot: any = { version: 3, reductionBasis: "per-row", generatedAt: new Date().toISOString(),
    studio: { id: "qa", company: properties[0].societa, comune: "Bologna", provincia: "BO", vat: "", commercialOwner: "", technicalOwner: "" }, immobili: properties };
  const render = async () => {
    await page.goto("about:blank");
    const html = await (service as any).renderSnapshot(snapshot);
    await page.setContent(html.replace("<html", '<html class="export-mode"'), { waitUntil: "networkidle" });
    await page.waitForSelector("#assets-ready", { state: "attached" });
  };
  const screenshot = async (name: string) => {
    if (process.env.PQ_GROUPING_REVIEW_DIR) await page.locator("#slide-5").screenshot({ path: `${process.env.PQ_GROUPING_REVIEW_DIR}/${name}.png` });
  };
  const noOverflow = async () => {
    const overflowing = await page.locator("#properties-card th, #property-rows td, #property-totals td, .metric strong").evaluateAll(cells => cells.flatMap(cell => {
      const range = document.createRange(); range.selectNodeContents(cell);
      const text = range.getBoundingClientRect(), box = cell.getBoundingClientRect();
      return text.left < box.left - 1 || text.right > box.right + 1 ? [cell.textContent] : [];
    }));
    assert.deepEqual(overflowing, []);
    const fits = await page.locator("#slide-5").evaluate(slide => {
      const summary = slide.querySelector(".bottom-grid")!.getBoundingClientRect();
      return summary.bottom <= slide.getBoundingClientRect().bottom;
    });
    assert.equal(fits, true, "table and summary must both fit on slide 5");
  };
  try {
    await render();
    assert.equal(await page.locator("#properties-card th").count(), 10);
    await screenshot("imu-default");
    snapshot.showImuColumns = true;
    await render();
    assert.equal(await page.locator("#properties-card th").count(), 12);
    assert.deepEqual((await page.locator("#properties-card th").allTextContents()).slice(7, 9), ["IMU attuale", "IMU prevista"]);
    assert.match(await page.locator("#property-rows tr:first-child td:nth-child(8)").innerText(), /53\.769,80/);
    assert.match(await page.locator("#property-rows tr:first-child td:nth-child(9)").innerText(), /42\.368,23/);
    assert.match(await page.locator("#property-totals td:nth-child(4)").innerText(), /282\.655,32/);
    assert.match(await page.locator("#property-totals td:nth-child(5)").innerText(), /232\.712,89/);
    await noOverflow(); await screenshot("imu-enabled");
    snapshot.tableRows = groupPresentationRows(properties, properties.map(p => ({ id: p.id, valuationGroupId: "group" })), {});
    await render();
    assert.equal(await page.locator("#property-rows tr").count(), 1);
    assert.match(await page.locator("#property-rows td:nth-child(8)").innerText(), /282\.655,32/);
    await noOverflow(); await screenshot("imu-grouped");
    snapshot.tableRows = undefined;
    snapshot.immobili = [{ ...properties[0], imuAttuale: null, imuOttenibile: 0 }];
    await render();
    assert.equal(await page.locator("#property-rows td:nth-child(8)").innerText(), "n.d.");
    assert.match(await page.locator("#property-rows td:nth-child(9)").innerText(), /0,00/);
    assert.equal(await page.locator("#property-totals td:nth-child(4)").innerText(), "n.d.");
    snapshot.immobili = Array.from({ length: 12 }, (_, i) => ({ ...properties[i % 3], id: String(i),
      societa: "ANGELINI PHARMA ITALIA AZIENDE CHIMICHE RIUNITE ANGELINI FRANCESCO - A.C.R.A.F. S.P.A.",
      renditaAttuale: 12345678.90, imuAttuale: 7654321.12 }));
    await render(); await noOverflow(); await screenshot("imu-long-many");
    snapshot.version = 2;
    await render();
    assert.equal(await page.locator("#properties-card th").count(), 10);
  } finally { await browser.close(); await service.onModuleDestroy(); }
});
