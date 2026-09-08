import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("Sospeso persists, remains distinct from Neutro and can be filtered in the archive", async ({ page }) => {
  const property = { id: "E2E-SUSPENDED", address: "Via campione 44", comune: "Milano", categoria: "D/7",
    currentRendita: 1000, estimatedRendita: 800, diffPercent: -20, imuDiff: 0, outcome: "Neutro", hasStudy: true,
    notes: "Nota immutata", documents: {}, documentUrls: {}, priceLists: [] };
  const study = { id: "E2E-SUSPENDED-STUDY", company: "Test esiti", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", createdAt: "2026-09-08", importedAt: "2026-09-08", deadline: "2026-12-31", diffRendita: -200,
    diffImu: 0, originalRendita: 1000, totalRendita: 800, catDRendita: 1000, commercialOwner: "", technicalOwner: "Test",
    notes: "", erpUrl: "", properties: [property] };
  const writes: unknown[] = [], unexpectedWrites: string[] = [];
  let failSave = false;
  await page.route("**/api/**", async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith("/api/auth/")) return route.fallback();
    if (pathname === "/api/studies") return route.fulfill({ json: [study] });
    if (pathname === `/api/properties/${property.id}` && route.request().method() === "PATCH") {
      const patch = route.request().postDataJSON();
      writes.push(patch);
      if (failSave) return route.fulfill({ status: 500, json: { message: "Errore campione" } });
      property.outcome = patch.outcome;
      return route.fulfill({ json: { id: property.id, outcome: property.outcome } });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) unexpectedWrites.push(pathname);
    return route.fulfill({ json: pathname.includes("activities") ? [] : null });
  });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto(`/studi/${study.id}`);
  const select = page.getByRole("combobox", { name: "Modifica esito immobile", exact: true });
  await select.selectOption("Sospeso");
  await expect(select).toHaveValue("Sospeso");
  await expect(select).toHaveClass(/suspended/);
  expect(writes).toEqual([{ outcome: "Sospeso" }]);
  await expect(page.locator(".summary-stat").filter({ hasText: "Sospesi" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".summary-stat").filter({ hasText: "Neutri" }).locator("strong")).toHaveText("0");
  await page.reload();
  await expect(select).toHaveValue("Sospeso");
  failSave = true;
  await select.selectOption("Negativo");
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("Sospeso");
  failSave = false;
  await page.goto("/immobili");
  await page.getByRole("combobox", { name: "Esito", exact: true }).selectOption("Sospeso");
  await expect(select).toHaveValue("Sospeso");
  await select.selectOption("Neutro");
  await expect(select).toHaveCount(0);
  expect(property.notes).toBe("Nota immutata");
  expect(property.currentRendita).toBe(1000);
  expect(unexpectedWrites).toEqual([]);
});
