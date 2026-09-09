import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright-core";
import { PresentationsService } from "../src/presentations/presentations.service.js";
import { PDFDocument } from "pdf-lib";
import { writeFile } from "node:fs/promises";
import path from "node:path";

test("v3 summary uses signed rent variation and asset label, preserving table amounts and v2", {
  skip: !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
}, async () => {
  const config = { get: (_key: string, fallback: unknown) => fallback };
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 990 } });
  const snapshot = { version: 3, generatedAt: "2026-09-09T18:00:00Z",
    studio: { id: "VISUAL-TEST", company: "Società campione", vat: "", comune: "Monza", provincia: "MI", commercialOwner: "", technicalOwner: "" },
    immobili: [{ id: "VISUAL-PROPERTY", societa: "Società campione", comune: "Monza (MI)", indirizzo: "Via campione 110",
      foglioParticellaSub: "Fg. 35 - Part. 67 - Sub. 711", categoria: "D/7", renditaAttuale: 715396.02,
      renditaAttribuibile: 595187.01, imuAttuale: 517553.25, imuOttenibile: 430588.04 }] };
  const deck = { id: "VISUAL-DECK", fileName: "visual-test.pdf", snapshot, deletedAt: null };
  const service = new PresentationsService({ presentationDeck: { findUnique: async () => deck } } as never, {} as never, {} as never, config as never);
  try {
    for (const [name, version, estimated, expected, className] of [
      ["reduction", 3, 595187.01, "−120.209,01", "good"],
      ["increase", 3, 835605.03, "+120.209,01", "bad"],
      ["zero", 3, 715396.02, "0,00", ""],
      ["v2-control", 2, 595187.01, "120.209,01", ""],
    ] as const) {
      snapshot.version = version; snapshot.immobili[0].renditaAttribuibile = estimated;
      const html = await (service as any).renderSnapshot(snapshot);
      await page.goto("about:blank"); // Fresh document: the template declares top-level const bindings.
      await page.setContent(html, { waitUntil: "load" });
      await page.waitForSelector("#assets-ready", { state: "attached" });
      await page.evaluate(() => document.documentElement.classList.add("export-mode"));
      const rent = page.locator("#rent-difference");
      assert.ok((await rent.innerText()).startsWith(expected));
      assert.equal(await rent.getAttribute("class") ?? "", className);
      assert.equal(await page.locator(".ten-year-head > span").textContent(), version === 3 ? "VALORIZZAZIONE ASSET" : "Saving in 10 anni");
      assert.ok((await page.locator("#saving-ten-year").innerText()).startsWith("869.652,10"));
      if (name === "reduction") {
        assert.equal(await rent.evaluate(el => getComputedStyle(el).color), await page.locator("#imu-variation").evaluate(el => getComputedStyle(el).color));
        assert.ok((await page.locator("#property-totals td").nth(3).innerText()).startsWith("120.209,01"));
      }
      const fits = await page.locator(".ten-year-head").evaluate(el => {
        const label = el.querySelector("span")!.getBoundingClientRect(), value = el.querySelector("strong")!.getBoundingClientRect();
        return label.right <= value.left && el.scrollWidth <= el.clientWidth + 1;
      });
      assert.ok(fits, `${name}: asset label must not overlap amount`);
      if (process.env.PQ_SUMMARY_REVIEW_DIR) await page.locator("#slide-5").screenshot({ path: path.join(process.env.PQ_SUMMARY_REVIEW_DIR, `${name}.png`) });
    }
    snapshot.version = 3; snapshot.immobili[0].renditaAttribuibile = 595187.01;
    const result = await service.renderV3Pdf(deck.id);
    assert.equal((await PDFDocument.load(result.pdf)).getPageCount(), 6);
    if (process.env.PQ_SUMMARY_REVIEW_DIR) await writeFile(path.join(process.env.PQ_SUMMARY_REVIEW_DIR, "v3-summary.pdf"), result.pdf);
  } finally { await browser.close(); await service.onModuleDestroy(); }
});
