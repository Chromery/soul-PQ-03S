import { PDFDocument, degrees } from "pdf-lib";
import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { createHash } from "node:crypto";

test("automatic text rotation, split control, whole-file geometry/calibration, undo and saved zero", async ({ page }) => {
  test.setTimeout(120_000);
  const pdf = await PDFDocument.create();
  for (const [index, rotation] of [90, 180, 90, 0].entries()) {
    const sheet = pdf.addPage(index === 3 ? [400, 300] : [300, 400]);
    sheet.drawText("PIANTA PIANO TERRA", { x: 180, y: 160, size: 9, rotate: degrees(rotation) });
    sheet.drawText("STUDIO TECNICO CATASTALE", { x: 160, y: 140, size: 9, rotate: degrees(rotation) });
    if (index === 2) sheet.setRotation(degrees(90));
  }
  const bytes = Buffer.from(await pdf.save());
  const alpha = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 20;
    c.getContext("2d")!.fillRect(0, 0, 20, 20); return c.toDataURL(); });
  const document = { kind: "remote", url: "/api/e2e/rotation.pdf", fileName: "rotation.pdf" };
  const property = { id: "E2E-ROTATION", address: "Planimetria campione", comune: "Milano", categoria: "D/7",
    currentRendita: 1000, estimatedRendita: 800, diffPercent: -20, imuDiff: 0, outcome: "Neutro", hasStudy: true,
    documents: { planimetria: document.fileName }, documentUrls: { planimetria: document.url }, priceLists: [] };
  const study = { id: "ROTATION-STUDY", company: "Test rotazione", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", createdAt: "2026-09-09", importedAt: "2026-09-09", deadline: "2026-12-31", diffRendita: 0,
    diffImu: 0, originalRendita: 1000, totalRendita: 800, catDRendita: 1000, commercialOwner: "", technicalOwner: "Test",
    notes: "", erpUrl: "", properties: [property] };
  const polygon = [{ x: 100, y: 100 }, { x: 119, y: 100 }, { x: 119, y: 119 }, { x: 100, y: 119 }];
  const region = { bounds: { minX: 100, minY: 100, maxX: 119, maxY: 119, count: 400 }, seed: { x: 110, y: 110 },
    count: 400, width: 20, height: 20, alphaDataUrl: alpha };
  let draft: any = { version: 1, propertyId: property.id, document, sheetSize: "A3", scaleDenominator: 500,
    activeUsage: "capannone", activeTool: "pan", opacityPercent: 44, threshold: 210, inflate: 1, gap: 2, dash: 0,
    selections: [{ id: "AREA-ROT", page: 4, usageId: "capannone", color: "#00aaff", opacity: .44, rate: 100,
      source: "polygon", polygon, totalPixels: 1280 * 960, region }],
    lotBoundaries: [{ id: "LOT-ROT", page: 4, polygon, region, totalPixels: 1280 * 960 }],
    pageScales: { "4": { sheetSize: "A3", scaleDenominator: 500, scaleSource: "CALIBRATION",
      calibration: { page: 4, knownMeters: 10, scaleDenominator: 500, start: { x: 100, y: 100 }, end: { x: 200, y: 100 } } } } };
  let saves = 0; const unexpected: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/studies") return route.fulfill({ json: [study] });
    if (path === document.url) return route.fulfill({ contentType: "application/pdf", body: bytes });
    if (path.endsWith("/analysis-draft")) {
      if (route.request().method() === "PUT") { draft = route.request().postDataJSON(); saves++; }
      return route.fulfill({ json: draft });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) unexpected.push(path);
    return route.fulfill({ json: path.includes("activities") ? [] : null });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/"); await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  const url = `/studi/${study.id}/immobili/${property.id}/planimetria`;
  await page.goto(url);
  const rotate = page.getByRole("button", { name: "Ruota pagina a destra", exact: true });
  await expect(rotate).toBeEnabled(); await expect(rotate).toContainText("90°");
  const save = async () => { const before = saves; await page.getByRole("button", { name: "Salva bozza", exact: true }).click();
    await expect.poll(() => saves).toBe(before + 1); };
  await rotate.click(); await expect(rotate).toBeEnabled(); await save();
  expect(draft.pageRotations).toEqual({ "1": 180, "2": 180, "3": 0 });
  await page.getByRole("button", { name: "Opzioni rotazione", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ruota tutto il file di 90° a destra (4 pagine)", exact: true }).click();
  await expect(rotate).toBeEnabled(); await save();
  expect(draft.pageRotations).toEqual({ "1": 270, "2": 270, "3": 90, "4": 90 });
  expect(draft.selections[0].polygon[0]).toEqual({ x: 859, y: 100 });
  expect(draft.lotBoundaries[0].polygon[0]).toEqual({ x: 859, y: 100 });
  expect(draft.selections[0].region.count).toBe(400);
  expect(draft.pageScales["4"].calibration.start).toEqual({ x: 859, y: 100 });
  expect(draft.pageScales["4"].scaleDenominator).toBe(500);
  await page.getByTitle(/^Indietro/).click(); await expect(rotate).toBeEnabled(); await save();
  expect(draft.pageRotations).toEqual({ "1": 180, "2": 180, "3": 0 });
  expect(draft.selections[0].polygon).toEqual(polygon);
  expect(draft.pageScales["4"].calibration.start).toEqual({ x: 100, y: 100 });
  await rotate.click(); await expect(rotate).toBeEnabled(); await rotate.click(); await expect(rotate).toBeEnabled(); await save();
  expect(draft.pageRotations["1"]).toBe(0);
  await page.reload(); await expect(rotate).toBeEnabled(); await expect(rotate).toContainText("0°");
  expect(unexpected).toEqual([]);
});

for (const mode of ["pending", "missing", "legacy-ai"] as const) test(`scanned PDF ${mode} job: automatic orientation and manual zero protection`, async ({ page }) => {
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 200; c.height = 300;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, 200, 300);
    ctx.fillStyle = "black"; ctx.font = "18px sans-serif"; ctx.fillText("PIANTA PIANO TERRA", 5, 70); return c.toDataURL(); });
  const pdf = await PDFDocument.create(), image = await pdf.embedPng(png);
  pdf.addPage([200, 300]).drawImage(image, { x: 0, y: 0, width: 200, height: 300 });
  const bytes = Buffer.from(await pdf.save()), hash = createHash("sha256").update(bytes).digest("hex");
  const document = { kind: "remote", url: `/api/e2e/scan-${mode}.pdf`, fileName: `scan-${mode}.pdf` };
  const property = { id: `SCAN-${mode}`, address: "Scansione campione", comune: "Milano", categoria: "D/7", currentRendita: 1000,
    estimatedRendita: 800, diffPercent: 0, imuDiff: 0, outcome: "Neutro", hasStudy: true,
    documents: { planimetria: document.fileName }, documentUrls: { planimetria: document.url }, priceLists: [] };
  const study = { id: "SCAN-STUDY", company: "Test scan", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", createdAt: "2026-09-09", importedAt: "2026-09-09", deadline: "2026-12-31", diffRendita: 0,
    diffImu: 0, originalRendita: 1000, totalRendita: 800, catDRendita: 1000, commercialOwner: "", technicalOwner: "Test",
    notes: "", erpUrl: "", properties: [property] };
  let draft: any = { version: 1, propertyId: property.id, document, sheetSize: "A3", scaleDenominator: 500, scaleSource: "USER",
    activeUsage: "capannone", activeTool: "pan", opacityPercent: 44, threshold: 210, inflate: 1, gap: 2, dash: 0, selections: [] };
  const job = { id: "SCAN-JOB", model: mode === "legacy-ai" ? "qwen3.6-35b-fast" : "tesseract-ocr-ita-4-orientations", propertyId: property.id, status: "RUNNING", sourceFileName: document.fileName,
    sourceSha256: hash, scale: null, pageScales: [], warnings: [] };
  let complete = mode !== "missing", polls = 0, saves = 0; const requests: any[] = [], unexpected: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/studies") return route.fulfill({ json: [study] });
    if (path === document.url) return route.fulfill({ contentType: "application/pdf", body: bytes });
    if (path.endsWith("/analysis-draft")) { if (method === "PUT") { draft = route.request().postDataJSON(); saves++; } return route.fulfill({ json: draft }); }
    if (path.endsWith("/scale-extraction-jobs/latest")) return route.fulfill({ json: mode !== "missing" ? job : null });
    if (path.endsWith("/scale-extraction-jobs") && method === "POST") { requests.push(route.request().postDataJSON()); job.model = "tesseract-ocr-ita-4-orientations"; return route.fulfill({ json: job }); }
    if (path.endsWith("/scale-extraction-jobs/SCAN-JOB")) { polls++;
      if (job.model === "qwen3.6-35b-fast") return route.fulfill({ json: { ...job, status: "FAILED", errorMessage: "Provider timeout" } });
      return route.fulfill({ json: complete ? { ...job, status: "SUCCEEDED",
      pageScales: [{ page: 1, scale: null, confidence: 0, warnings: [], orientation: { rotation: 90, confidence: .95, evidence: "OCR: PIANTA", source: "ocr" } }] } : job }); }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) unexpected.push(path);
    return route.fulfill({ json: path.includes("activities") ? [] : null });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/"); await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto(`/studi/${study.id}/immobili/${property.id}/planimetria`);
  const rotate = page.getByRole("button", { name: "Ruota pagina a destra", exact: true });
  await expect(rotate).toBeEnabled();
  if (mode === "missing") {
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].apply_active_scale).toBe(false);
    expect(requests[0].orientation_only).toBe(true);
    for (let i = 0; i < 4; i++) { await rotate.click(); await expect(rotate).toBeEnabled(); }
    complete = true;
  }
  await expect.poll(() => polls).toBeGreaterThan(0);
  await expect(page.getByText("Orientamento OCR verificato", { exact: true }).first()).toBeVisible();
  await expect(rotate).toContainText(mode !== "missing" ? "90°" : "0°");
  await page.getByRole("button", { name: "Salva bozza", exact: true }).click();
  await expect.poll(() => saves).toBe(1);
  expect(draft.pageRotations["1"]).toBe(mode !== "missing" ? 90 : 0);
  if (mode === "legacy-ai") { expect(requests).toHaveLength(1); expect(requests[0].orientation_only).toBe(true); }
  expect(draft.scaleDenominator).toBe(500);
  expect(unexpected).toEqual([]);
});
