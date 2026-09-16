import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

for (const groupScope of [false, true]) test(`presentation grouping in ${groupScope ? "study group" : "study"}: defaults, edits, dissolve, persistence and partial export`, async ({ page }) => {
  test.setTimeout(90_000);
  const properties = [1, 2, 3, 4].map((n, i) => ({ id: `PG-${n}`, valuationGroupId: n < 3 ? "original-group" : null,
    address: n < 3 ? "Via Roma 44" : `Via Test ${n}`, humanReadableAddress: n < 3 ? "Via Roma 44" : `Via Test ${n}`,
    comune: "Milano", provincia: "MI", categoria: "D/7", foglio: "12", particella: "34", subalterno: String(n),
    currentRendita: [100.10, 200.20, 300.30, 50][i], estimatedRendita: [50, 100, 200, 60][i],
    currentImu: 10, estimatedImu: 5, diffPercent: 0, imuDiff: 0, outcome: n === 4 ? "Negativo" : "Positivo",
    hasStudy: true, notes: "", documents: {}, priceLists: [] }));
  const study = { id: "PG-STUDY", studyGroupId: "PG-GROUP", studyGroupName: "Portafoglio campione", company: "Società campione",
    vat: "", comune: "Milano", provincia: "MI", region: "Lombardia", status: "Aperta", createdAt: "2026-09-15",
    importedAt: "2026-09-15", deadline: "2026-12-31", diffRendita: 0, diffImu: 0, originalRendita: 650.60,
    totalRendita: 410, catDRendita: 650.60, commercialOwner: "", technicalOwner: "", notes: "", erpUrl: "", properties };
  const endpoint = groupScope ? "/api/study-groups/PG-GROUP/presentations" : "/api/studies/PG-STUDY/presentations";
  const overrides: Record<string, string> = {};
  const snapshots: any[] = [], unexpected: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/studies") return route.fulfill({ json: [study, { ...study, id: "PG-OTHER", company: "Seconda società", properties: [] }] });
    if (path.endsWith("/presentations/draft")) {
      if (method === "PATCH") {
        expect(path).toBe(`${endpoint}/draft`);
        for (const [key, value] of Object.entries(route.request().postDataJSON().changes)) {
          if (value === null) delete overrides[key]; else overrides[key] = value as string;
        }
      }
      return route.fulfill({ json: { overrides, revision: 1 } });
    }
    if (path === `${endpoint}/v3` && method === "POST") {
      snapshots.push({ ...route.request().postDataJSON(), savedOverrides: structuredClone(overrides) });
      return route.fulfill({ json: { id: "pg-deck", version: 3, propertyCount: 2, fileName: "Campione.pdf", createdAt: "2026-09-15T10:00:00Z", pdfUrl: "/api/presentations/pg-deck/pdf" } });
    }
    if (method !== "GET") unexpected.push(path);
    return route.fulfill({ json: path.endsWith("/presentations") || path.includes("activities") ? [] : null });
  });
  await page.goto("/"); await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto(groupScope ? "/gruppi-studio/PG-GROUP" : "/studi/PG-STUDY");
  const preview = page.locator("#presentation-data");
  const saved = () => expect(preview.getByRole("status")).toContainText("Modifiche salvate");
  await saved();
  await expect(preview.locator("tbody tr")).toHaveCount(3);
  await expect(preview.locator(".presentation-group-row").getByRole("textbox", { name: /^foglioParticellaSub del/ })).toHaveValue(/Sub\. 1, 2/);
  await expect(preview.locator(".presentation-group-row").getByRole("textbox", { name: /^renditaAttuale del/ })).toHaveValue("300.30");
  await preview.getByRole("button", { name: "Espandi gruppo Via Roma 44", exact: true }).click();
  const amount = preview.locator('[data-property-id="PG-1"]').getByRole("textbox", { name: "Rendita catastale attuale per Via Roma 44", exact: true });
  await amount.fill("110.10"); await saved();
  await page.reload(); await saved();
  await expect(preview.locator(".presentation-group-row").getByRole("textbox", { name: /^renditaAttuale del/ })).toHaveValue("310.30");
  await preview.getByRole("checkbox", { name: "Seleziona gruppo Via Roma 44", exact: true }).check();
  await preview.getByRole("button", { name: "Sciogli raggruppamenti selezionati", exact: true }).click();
  await saved(); await expect(preview.locator("tbody tr")).toHaveCount(4);
  await expect(amount).toHaveValue("110.10");
  await page.reload(); await saved(); await expect(preview.locator(".presentation-group-row")).toHaveCount(0);
  for (const id of ["PG-1", "PG-3"]) await preview.locator(`[data-property-id="${id}"]`).getByRole("checkbox").check();
  await preview.getByRole("button", { name: "Raggruppa selezionati", exact: true }).click();
  await saved(); await page.reload(); await saved();
  await expect(preview.locator(".presentation-group-row").getByRole("textbox", { name: /^foglioParticellaSub del/ })).toHaveValue(/Sub\. 1, 3/);
  await expect(preview.locator(".presentation-group-row").getByRole("textbox", { name: /^renditaAttuale del/ })).toHaveValue("410.40");
  await page.getByRole("button", { name: "Generazione Presentazione", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Generazione Presentazione", exact: true });
  await expect(modal.locator(".presentation-group-row")).toHaveCount(1);
  await modal.getByRole("button", { name: /Espandi gruppo/ }).click();
  await modal.locator('[data-property-id="PG-3"]').getByRole("checkbox").uncheck();
  await modal.getByRole("button", { name: "Genera PDF v3", exact: true }).click();
  await expect(modal.getByText("PDF v3 pronto", { exact: true })).toBeVisible();
  expect(snapshots[0].propertyIds.sort()).toEqual(["PG-1", "PG-2"]);
  expect(snapshots[0].properties.find((property: any) => property.id === "PG-1").renditaAttuale).toBe(110.10);
  expect(snapshots[0].savedOverrides["PG-1:presentationGroup"]).toBe(snapshots[0].savedOverrides["PG-3:presentationGroup"]);
  await modal.getByRole("button", { name: "Chiudi", exact: true }).last().click();
  page.once("dialog", dialog => dialog.accept());
  await preview.getByRole("button", { name: "Ripristina gruppi originali", exact: true }).click();
  await saved(); await expect(preview.locator(".presentation-group-row").getByRole("textbox", { name: /^foglioParticellaSub del/ })).toHaveValue(/Sub\. 1, 2/);
  await expect(preview.locator(".presentation-group-row").getByRole("textbox", { name: /^renditaAttuale del/ })).toHaveValue("310.30");
  expect(overrides["PG-1:renditaAttuale"]).toBe("110.10");
  expect(properties[0].valuationGroupId).toBe("original-group");
  expect(properties[0].currentRendita).toBe(100.10);
  const groupRow = preview.locator(".presentation-group-row");
  const groupCategory = groupRow.getByRole("textbox", { name: /^categoria del/ });
  await groupCategory.fill("D/4"); await groupCategory.press("Enter"); await saved();
  expect(overrides["PG-1:categoria"]).toBe("D/4");
  expect(overrides["PG-2:categoria"]).toBe("D/4");
  const groupRent = groupRow.getByRole("textbox", { name: /^renditaAttuale del/ });
  await groupRent.fill("620,60"); await groupRent.press("Tab"); await saved();
  expect(overrides["PG-1:renditaAttuale"]).toBe("220.20");
  expect(overrides["PG-2:renditaAttuale"]).toBe("400.40");
  await page.reload(); await saved();
  await expect(groupCategory).toHaveValue("D/4");
  await expect(groupRent).toHaveValue("620.60");
  await groupRow.getByRole("button", { name: /^Ripristina renditaAttuale del/ }).click(); await saved();
  await expect(groupRent).toHaveValue("300.30");
  expect(overrides["PG-1:renditaAttuale"]).toBeUndefined();
  await page.getByRole("button", { name: "Generazione Presentazione", exact: true }).click();
  await modal.getByRole("button", { name: /Espandi gruppo/ }).click();
  await modal.locator('[data-property-id="PG-2"]').getByRole("checkbox").uncheck();
  const partialRent = modal.locator(".presentation-group-row").getByRole("textbox", { name: /^renditaAttuale del/ });
  await partialRent.fill("50.01"); await partialRent.press("Tab"); await saved();
  expect(overrides["PG-1:renditaAttuale"]).toBe("50.01");
  expect(overrides["PG-2:renditaAttuale"]).toBeUndefined();
  await modal.getByRole("button", { name: "Genera PDF v3", exact: true }).click();
  await expect(modal.getByText("PDF v3 pronto", { exact: true })).toBeVisible();
  expect(snapshots.at(-1).properties.find((p: any) => p.id === "PG-1").renditaAttuale).toBe(50.01);
  expect(snapshots.at(-1).propertyIds).not.toContain("PG-2");
  expect(properties[0].categoria).toBe("D/7");
  expect(properties[0].currentRendita).toBe(100.10);
  await modal.getByRole("button", { name: "Chiudi", exact: true }).last().click();
  expect(unexpected).toEqual([]);
  if (process.env.PQ_GROUPING_REVIEW_DIR) await preview.screenshot({ path: `${process.env.PQ_GROUPING_REVIEW_DIR}/grouping-${groupScope ? "portfolio" : "study"}.png` });
});
