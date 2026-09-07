import { PDFDocument, rgb } from "pdf-lib";
import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("manual calibration can target one or all pages and persists independently with undo", async ({ page }) => {
  test.setTimeout(120_000);
  const pdf = await PDFDocument.create();
  for (const size of [[842, 595], [595, 842], [842, 595]]) {
    pdf.addPage(size).drawRectangle({ x: 50, y: 50, width: 200, height: 150, borderWidth: 1, borderColor: rgb(0, 0, 0) });
  }
  const pdfBytes = Buffer.from(await pdf.save());
  const document = { kind: "remote", url: "/api/e2e/calibration.pdf", fileName: "calibration.pdf" };
  const property = { id: "E2E-CALIBRATION", address: "Planimetria campione", comune: "Milano", categoria: "D/7",
    currentRendita: 1000, estimatedRendita: 800, diffPercent: -20, imuDiff: 0, outcome: "Da verificare", hasStudy: true,
    documents: { planimetria: "calibration.pdf", visura: "" }, documentUrls: { planimetria: document.url }, priceLists: [] };
  const study = { id: "E2E-STUDY", company: "Test editor", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", createdAt: "2026-09-07", importedAt: "2026-09-07", deadline: "2026-12-31", diffRendita: 0,
    diffImu: 0, originalRendita: 1000, totalRendita: 800, catDRendita: 1000, commercialOwner: "", technicalOwner: "Test",
    notes: "", erpUrl: "", properties: [property] };
  let draft: any = { version: 1, propertyId: property.id, document, sheetSize: "A3", scaleDenominator: 500,
    activeUsage: "capannone", activeTool: "ruler", opacityPercent: 44, threshold: 210, inflate: 1, gap: 2, dash: 0,
    selections: [], pageScales: {
      "1": { sheetSize: "A3", scaleDenominator: 500, scaleSource: "USER" },
      "2": { sheetSize: "A4", scaleDenominator: 250, scaleSource: "USER" },
      "3": { sheetSize: "A3", scaleDenominator: 1000, scaleSource: "AI", aiScaleDenominator: 1000 },
    } };
  let saves = 0;
  const unexpectedWrites: string[] = [];
  // Isolate the fixture completely: no study/property mutation reaches the real DB.
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/auth/")) return route.fallback();
    if (url.pathname === "/api/studies") return route.fulfill({ json: [study] });
    if (url.pathname === document.url) return route.fulfill({ contentType: "application/pdf", body: pdfBytes });
    if (url.pathname.endsWith(`/properties/${property.id}/analysis-draft`)) {
      if (route.request().method() === "PUT") { draft = route.request().postDataJSON(); saves++; }
      return route.fulfill({ json: draft });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) unexpectedWrites.push(url.pathname);
    if (url.pathname.includes("/activities")) return route.fulfill({ json: [] });
    return route.fulfill({ json: null });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  page.on("dialog", dialog => void dialog.accept());
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto(`/studi/${study.id}/immobili/${property.id}/planimetria`);
  await expect(page.locator(".canvas-scale-button")).toHaveText("Pag. 1 · A3 1:500");
  await expect(page.locator(".plan-stage.is-busy")).toHaveCount(0);
  const stage = page.locator(".plan-stage");
  const box = await stage.boundingBox();
  if (!box) throw new Error("Missing editor canvas");
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .2, { steps: 6 });
  await page.mouse.up();
  await page.getByLabel("Distanza reale del segmento (metri)").fill("50");
  const dialog = page.getByRole("dialog", { name: "Applica taratura manuale" });
  const save = async () => {
    const before = saves;
    await page.getByRole("button", { name: "Salva bozza", exact: true }).click();
    await expect.poll(() => saves).toBe(before + 1);
  };
  await page.getByRole("button", { name: "Taratura", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "Solo pagina 1" })).toBeChecked();
  await dialog.getByRole("button", { name: "Applica taratura", exact: true }).click();
  await save();
  const calibratedScale = draft.pageScales["1"].scaleDenominator;
  expect(calibratedScale).not.toBe(500);
  expect(draft.pageScales["2"].scaleDenominator).toBe(250);
  expect(draft.pageScales["3"].scaleDenominator).toBe(1000);
  await page.getByRole("button", { name: "Taratura", exact: true }).click();
  await dialog.getByRole("radio", { name: "Tutte le 3 pagine" }).check();
  await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
  await save();
  expect(draft.pageScales["2"].scaleDenominator).toBe(250);
  await page.getByRole("button", { name: "Taratura", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "Solo pagina 1" })).toBeChecked();
  await dialog.getByRole("radio", { name: "Tutte le 3 pagine" }).check();
  await dialog.getByRole("button", { name: "Applica taratura", exact: true }).click();
  await save();
  for (const scale of Object.values(draft.pageScales) as any[]) {
    expect(scale.scaleDenominator).toBe(calibratedScale);
    expect(scale.sheetSize).toBe("A3");
    expect(scale.scaleSource).toBe("CALIBRATION");
  }
  expect(draft.pageScales["1"].calibration.page).toBe(1);
  expect(draft.pageScales["2"].calibration).toBeNull();
  expect(draft.pageScales["3"].aiScaleDenominator).toBe(1000);
  await page.getByTitle("Pagina successiva", { exact: true }).click();
  await expect(page.locator(".canvas-scale-button")).toHaveText(`Pag. 2 · A3 1:${calibratedScale}`);
  await expect(page.locator(".plan-stage.is-busy")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".canvas-scale-button")).toHaveText("Pag. 2 · A4 1:250");
  await save();
  expect(draft.pageScales["3"].scaleDenominator).toBe(1000);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".canvas-scale-button")).toHaveText(`Pag. 2 · A3 1:${calibratedScale}`);
  await save();
  await page.reload();
  await expect(page.locator(".canvas-scale-button")).toHaveText(`Pag. 1 · A3 1:${calibratedScale}`);
  await page.getByTitle("Pagina successiva", { exact: true }).click();
  await expect(page.locator(".canvas-scale-button")).toHaveText(`Pag. 2 · A3 1:${calibratedScale}`);
  await page.locator(".canvas-scale-button").click();
  const scaleDialog = page.getByRole("dialog", { name: "Scala pagina 2" });
  await scaleDialog.getByRole("textbox").fill("333");
  await scaleDialog.getByRole("button", { name: "Applica scala", exact: true }).click();
  await save();
  expect(draft.pageScales["2"].scaleDenominator).toBe(333);
  expect(draft.pageScales["1"].scaleDenominator).toBe(calibratedScale);
  expect(draft.pageScales["3"].scaleDenominator).toBe(calibratedScale);
  for (const label of ["Negozio", "Commerciale", "Laboratorio", "Casa di cura", "Hotel", "Loc. tecnici", "Parcheggio multipiano"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Hotel", exact: true }).click();
  await expect(page.getByText(/nessuna tariffa predefinita per Hotel/)).toBeVisible();
  await page.getByRole("button", { name: "Aggiungi riga manuale", exact: true }).click();
  const usageSelect = page.locator(".area-table-usage-cell select").first();
  for (const id of ["negozio", "commerciale", "laboratorio", "casa-di-cura", "hotel", "locali-tecnici", "parcheggio-multipiano"]) {
    await usageSelect.selectOption(`fixed:${id}`);
    await save();
    expect(draft.selections[0].usageId).toBe(id);
    expect(draft.selections[0].rate).toBe(0);
  }
  await save();
  expect(draft.activeUsage).toBe("hotel");
  await page.reload();
  await expect(page.getByRole("button", { name: "Hotel", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".area-table-usage-cell select").first()).toHaveValue("fixed:parcheggio-multipiano");
  expect(unexpectedWrites).toEqual([]);
});
