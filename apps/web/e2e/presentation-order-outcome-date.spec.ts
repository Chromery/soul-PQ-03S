import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("presentation rows sort by outcome and columns without mixing edits; study date appears after every outcome change", async ({ page }) => {
  const properties = ["Neutro", "Sospeso", "Negativo", "Positivo", "Positivo"].map((outcome, i) => ({
    id: `ORDER-${i}`, address: `Via test ${i}`, comune: "Milano", provincia: "MI", categoria: "D/7",
    foglio: "1", particella: String(i), subalterno: "1", currentRendita: [20, 100, 3, 12, 2][i],
    estimatedRendita: 1, currentImu: i === 0 ? null : 10, estimatedImu: null, diffPercent: 0,
    imuDiff: 0, outcome, hasStudy: true, notes: "", documents: {}, priceLists: [],
  }));
  const study = { id: "ORDER-STUDY", studyGroupId: "ORDER-GROUP", studyGroupName: "Gruppo campione",
    company: "Test ordine", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", concludedAt: null as string | null, createdAt: "2026-09-09", importedAt: "2026-09-09",
    deadline: "2026-12-31", diffRendita: 0, diffImu: 0, originalRendita: 137, totalRendita: 5,
    catDRendita: 137, commercialOwner: "", technicalOwner: "Test", notes: "", erpUrl: "", properties };
  const writes: unknown[] = [];
  const overrides: Record<string, string> = {};
  await page.route("**/api/**", async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith("/api/auth/")) return route.fallback();
    if (pathname.endsWith("/presentations/draft")) {
      if (route.request().method() === "PATCH") {
        for (const [key, value] of Object.entries(route.request().postDataJSON().changes)) {
          if (value === null) delete overrides[key]; else overrides[key] = value as string;
        }
      }
      return route.fulfill({ json: { overrides, revision: 1 } });
    }
    if (pathname === "/api/studies") return route.fulfill({ json: [study, { ...study, id: "ORDER-SECOND-STUDY", company: "Seconda società", properties: [] }] });
    if (pathname === `/api/studies/${study.id}` && route.request().method() === "PATCH") {
      const patch = route.request().postDataJSON(); writes.push(patch);
      study.status = patch.status;
      study.concludedAt = "2026-09-09T10:30:00Z";
      return route.fulfill({ json: study });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) writes.push(pathname);
    return route.fulfill({ json: pathname.includes("activities") ? [] : null });
  });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto(`/studi/${study.id}`);
  const table = page.locator(".presentation-preview-table");
  const rowIds = () => table.locator('tbody input[aria-label^="indirizzo per"]').evaluateAll(els => els.map(el => el.getAttribute("aria-label")!.replace("indirizzo per ", "")));
  await expect.poll(rowIds).toEqual(["ORDER-3", "ORDER-4", "ORDER-2", "ORDER-1", "ORDER-0"]);
  await table.getByRole("button", { name: "R.C. attuale (€)", exact: true }).click();
  await expect.poll(rowIds).toEqual(["ORDER-4", "ORDER-2", "ORDER-3", "ORDER-0", "ORDER-1"]);
  await table.getByRole("button", { name: "R.C. attuale (€)", exact: true }).click();
  await expect.poll(rowIds).toEqual(["ORDER-1", "ORDER-0", "ORDER-3", "ORDER-2", "ORDER-4"]);
  await table.getByRole("textbox", { name: "indirizzo per ORDER-3", exact: true }).fill("Via corretta");
  await table.getByRole("button", { name: "Indirizzo", exact: true }).click();
  await expect(table.getByRole("textbox", { name: "indirizzo per ORDER-3", exact: true })).toHaveValue("Via corretta");
  for (const button of await table.getByRole("button").all()) await button.click();
  expect(writes).toEqual([]);
  for (const status of ["Positiva", "Negativa", "Annullata", "Sospesa", "Aperta"]) {
    await page.getByRole("combobox", { name: "Modifica stato studio di fattibilità", exact: true }).selectOption(status);
    await expect(page.getByLabel("Data esito studio", { exact: true })).toContainText("09/09/2026");
    await expect(page.getByRole("combobox", { name: "Modifica stato studio di fattibilità", exact: true })).toBeEnabled();
  }
  expect(writes).toEqual(["Positiva", "Negativa", "Annullata", "Sospesa", "Aperta"].map(status => ({ status })));
  expect(properties.map(p => p.id)).toEqual(["ORDER-0", "ORDER-1", "ORDER-2", "ORDER-3", "ORDER-4"]);
  await page.reload();
  await expect(page.getByLabel("Data esito studio", { exact: true })).toContainText("09/09/2026");
  await page.goto("/gruppi-studio/ORDER-GROUP");
  await expect.poll(rowIds).toEqual(["ORDER-3", "ORDER-4", "ORDER-2", "ORDER-1", "ORDER-0"]);
  await table.getByRole("button", { name: "Esito", exact: true }).click();
  await expect.poll(rowIds).toEqual(["ORDER-0", "ORDER-1", "ORDER-2", "ORDER-3", "ORDER-4"]);
});
