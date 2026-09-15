import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { PDFDocument } from "pdf-lib";

test("long company and address keep editor panels and tools inside the viewport", async ({ page }) => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 2; i++) pdf.addPage([600, 400]).drawText("PIANTA PIANO TERRA", { x: 40, y: 250 });
  const bytes = Buffer.from(await pdf.save());
  const document = { kind: "remote", fileName: "layout-test.pdf", url: "/api/e2e/layout.pdf" };
  const property = { id: "LAYOUT-P", address: "ANCONA(AN) VIA DEL PINOCCHIO n. 22 Piano T-1 - 2-3", comune: "Ancona", provincia: "AN",
    categoria: "D/7", currentRendita: 1000, estimatedRendita: 800, diffPercent: -20, imuDiff: 0,
    outcome: "Positivo", hasStudy: true, notes: "", priceLists: [],
    documents: { planimetria: document.fileName }, documentUrls: { planimetria: document.url } };
  const study = { id: "LAYOUT-S", company: "ANGELINI PHARMA ITALIA AZIENDE CHIMICHE RIUNITE ANGELINI FRANCESC O - A.C.R.A.F. S.P.A., ENUNCIABILE ANCHE ANGELINI PHARMA ITALIA S.P.A. , ANGELINI PHARMA S.P.A. , A.C.R.A.F. S.P.A. , ACRAF S.P.A. , ANGELINI S.P.A. AZIENDE CHIMICHE RIUNITE ANGELINI",
    vat: "", comune: "Ancona", provincia: "AN", region: "Marche", status: "Aperta", createdAt: "2026-09-15", importedAt: "2026-09-15",
    deadline: "2026-12-31", diffRendita: -200, diffImu: 0, originalRendita: 1000, totalRendita: 800,
    catDRendita: 1000, commercialOwner: "", technicalOwner: "", notes: "", erpUrl: "", properties: [property] };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/studies") return route.fulfill({ json: [study] });
    if (path === document.url) return route.fulfill({ contentType: "application/pdf", body: bytes });
    if (path.endsWith("/analysis-draft")) return route.fulfill({ json: { version: 1, propertyId: property.id, document,
      selections: [], pageRotations: { "1": 0, "2": 0 }, sheetSize: "A3", scaleDenominator: 200 } });
    return route.fulfill({ json: path.includes("activities") ? [] : null });
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/"); await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto(`/studi/${study.id}/immobili/${property.id}/planimetria`);
  await expect(page.getByRole("button", { name: "Ruota pagina a destra", exact: true })).toBeEnabled();
  for (const [width, height] of [[1366,768], [1280,720], [1440,900], [1920,1080], [1024,768], [960,768]]) {
    await page.setViewportSize({ width, height });
    const bounds = await page.locator(".plan-editor-grid").evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right }));
    expect(bounds.right, `editor at ${width}`).toBeLessThanOrEqual(width);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(await page.locator(".plan-editor-grid").evaluate(el => el.clientHeight)).toBeGreaterThan(250);
    for (const selector of [".areas-panel", ".canvas-toolbar", ".canvas-rotation-control", ".page-stepper"]) {
      const box = await page.locator(selector).boundingBox();
      if (box) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width, selector).toBeLessThanOrEqual(width); }
    }
    const panel = await page.locator(".areas-panel").boundingBox();
    if (panel) for (const button of await page.locator(".selection-action-row button").all()) {
      const box = await button.boundingBox();
      if (box) expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
    }
    if (process.env.PQ_LAYOUT_REVIEW_DIR) await page.screenshot({ path: `${process.env.PQ_LAYOUT_REVIEW_DIR}/editor-${width}.png` });
  }
  if (process.env.PQ_LAYOUT_BASELINE) return;
  await page.setViewportSize({ width: 1366, height: 768 });
  const sidebar = page.locator(".plan-tool-panel");
  await expect(sidebar.getByTitle(/^Indietro/)).toBeVisible();
  await expect(sidebar.getByTitle(/^Avanti/)).toBeVisible();
  await expect(sidebar.getByTitle(/^Cancella elemento selezionato/)).toBeVisible();
  expect(await page.locator(".editor-history-controls").evaluate(el => el.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(await page.locator(".property-notes-tool").evaluate(el => el.getBoundingClientRect().top));
  const right = page.getByRole("button", { name: "Ruota pagina a destra", exact: true });
  const left = page.getByRole("button", { name: "Ruota pagina a sinistra", exact: true });
  await expect(right).toHaveText(""); await expect(left).toHaveText("");
  await left.click(); await expect(right).toHaveAttribute("data-rotation", "270");
  await right.click(); await expect(right).toHaveAttribute("data-rotation", "0");
});
