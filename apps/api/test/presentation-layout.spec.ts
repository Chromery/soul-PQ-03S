import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { PDFDocument } from "pdf-lib";
import { validateDraftChanges, mergeDraftChanges } from "../src/presentations/presentation-draft.js";
import { PresentationsService } from "../src/presentations/presentations.service.js";
import type { PresentationSnapshot } from "../src/presentations/presentations.types.js";

const config = { get: (_key: string, fallback: unknown) => fallback };

test("table layout is validated and resettable independently of property edits", () => {
  for (const value of [true, 1, "", "auto", "two-pages", {}, []])
    assert.throws(() => validateDraftChanges({ changes: { tableLayout: value } }, new Set()));
  for (const value of ["compact", "paginated", null])
    assert.deepEqual(validateDraftChanges({ changes: { tableLayout: value } }, new Set()), { tableLayout: value });
  assert.throws(() => validateDraftChanges({ changes: { "foreign:tableLayout": "compact" } }, new Set()));
  assert.deepEqual(mergeDraftChanges({ tableLayout: "paginated", clientName: "Cliente" }, { tableLayout: null }), { clientName: "Cliente" });
});

test("study and group generations freeze the saved layout without changing company names or amounts", async () => {
  const saved: PresentationSnapshot[] = [];
  const overrides: Record<string, string> = { tableLayout: "paginated" };
  const property = { id: "p", outcome: "Positivo", societa: "Società completa", comune: "Roma", provincia: "RM",
    address: "Via Roma 1", humanReadableAddress: "Via Roma 1", foglio: "1", particella: "2", subalterno: "3",
    categoria: "D/7", currentRendita: 1000, estimatedRendita: 800, currentImu: 500, estimatedImu: 400 };
  const study = { id: "s", company: property.societa, properties: [property] };
  const service = new PresentationsService({
    presentationDraft: { findUnique: async () => ({ overrides }) },
    studyGroup: { findUnique: async () => ({ id: "g", name: "Gruppo", studies: [{ id: "s" }] }) },
    presentationDeck: { create: async ({ data }: any) => { saved.push(data.snapshot); return { ...data, id: "d", createdAt: new Date() }; } },
  } as never, { find: async () => study } as never, {} as never, config as never);
  await service.createV3("s", ["p"]);
  await service.createStudyGroupV3("g", ["p"]);
  overrides.tableLayout = "compact";
  await service.createV3("s", ["p"]);
  delete overrides.tableLayout;
  await service.createV3("s", ["p"]);
  assert.deepEqual(saved.map(s => s.tableLayout), ["paginated", "paginated", "compact", "compact"]);
  for (const s of saved) {
    assert.equal(s.immobili[0].societa, property.societa);
    assert.equal(s.immobili[0].renditaAttuale, 1000);
  }
});

test("measured V3 layout preserves every row, totals and summary, including the exported continuation pages", {
  skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, timeout: 120000,
}, async () => {
  const longName = "PORTAFOGLIO IMMOBILIARE - SOCIETA DI INVESTIMENTO PER AZIONI A CAPITALE FISSO IN GESTIONE ESTERNA ".repeat(2);
  const properties = Array.from({ length: 14 }, (_, index) => ({
    id: String(index), societa: index < 4 ? longName : `Società ${index}`, comune: "Roma (RM)",
    indirizzo: `Via del collaudo ${index}`, foglioParticellaSub: `Fg. 1 - Part. 2 - Sub. ${index}`, categoria: "D/7",
    renditaAttuale: 250000, renditaAttribuibile: 200000, imuAttuale: 50000, imuOttenibile: 40000,
  }));
  const snapshot: PresentationSnapshot = { version: 3, generatedAt: new Date().toISOString(),
    studio: { id: "s", company: "Cliente test", vat: "", comune: "Roma", provincia: "RM", commercialOwner: "", technicalOwner: "" },
    immobili: properties, tableRows: properties, optimizationValue: 700000 };
  const original = JSON.stringify(properties);
  const service = new PresentationsService({ presentationDeck: { findUnique: async () => ({ snapshot, fileName: "qa.pdf" }) } } as never,
    {} as never, {} as never, { get: () => process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } as never);
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 990 } });
  try {
    for (const layout of [undefined, "compact", "paginated"] as const) {
      for (const imu of [false, true]) {
        snapshot.tableLayout = layout; snapshot.showImuColumns = imu;
        await page.goto("about:blank");
        await page.setContent((await (service as any).renderSnapshot(snapshot)).replace("<html", '<html class="export-mode"'));
        await page.waitForSelector("#assets-ready", { state: "attached" });
        const count = await page.locator(".economics").count();
        if (layout === "paginated") assert.ok(count >= 2);
        else assert.equal(count, 1);
        assert.deepEqual(await page.locator(".economics tbody tr td:nth-child(3)").allTextContents(), properties.map(p => p.indirizzo));
        assert.deepEqual(await page.locator(".economics .company-name").allTextContents(), properties.map(p => p.societa));
        assert.equal(await page.locator(".economics tfoot").count(), 1);
        assert.equal(await page.locator(".economics .bottom-grid").count(), 1);
        assert.equal(await page.locator(".economics").last().locator(".bottom-grid").count(), 1);
        assert.match(await page.locator("#total-current-rent").innerText(), /3\.500\.000,00/);
        const overflow = await page.locator(".economics").evaluateAll(slides => slides.flatMap(slide => {
          const boundary = slide.getBoundingClientRect().bottom - parseFloat(getComputedStyle(slide).paddingBottom);
          return Array.from(slide.querySelectorAll("tbody tr, tfoot, .bottom-grid")).filter(el => el.getBoundingClientRect().bottom > boundary + 1).map(el => el.tagName);
        }));
        assert.deepEqual(overflow, [], `${layout}, IMU ${imu}`);
        if (layout === "paginated" && !imu) {
          const result = await service.renderPdf("paginated");
          const pdf = await PDFDocument.load(result.pdf);
          assert.equal(pdf.getPageCount(), 5 + count, "all economic pages precede the unchanged closing page");
          for (const p of pdf.getPages()) assert.ok(Math.abs(p.getWidth() - 841.89) < .01);
        }
      }
    }
    snapshot.tableLayout = "compact";
    snapshot.tableRows = Array.from({ length: 80 }, (_, i) => ({ ...properties[i % properties.length], id: `large-${i}`, indirizzo: `Immobile ${i}` }));
    await page.goto("about:blank");
    await page.setContent((await (service as any).renderSnapshot(snapshot)).replace("<html", '<html class="export-mode"'));
    await page.waitForSelector("#assets-ready", { state: "attached" });
    assert.ok(await page.locator(".economics").count() > 1, "compact mode paginates when shortening is insufficient");
    assert.deepEqual(await page.locator(".economics tbody td:nth-child(3)").allTextContents(), snapshot.tableRows.map(p => p.indirizzo));
    assert.equal(JSON.stringify(properties), original, "rendering must not modify snapshot source data");
  } finally { await browser.close(); await service.onModuleDestroy(); }
});
