import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("study optimization matches presentation totals, signs, edits and responsive cards", async ({ page }) => {
  const properties = [
    { id: "E2E-OPT-1", address: "Via campione 1", currentRendita: 1000.12, estimatedRendita: 800.10 },
    { id: "E2E-OPT-2", address: "Via campione 2", currentRendita: 500.33, estimatedRendita: 550.40 },
  ].map(property => ({ ...property, comune: "Milano", provincia: "MI", categoria: "D/7", foglio: "1", particella: "2", subalterno: "3",
    diffPercent: 0, imuDiff: 0, outcome: "Da verificare", hasStudy: true, notes: "", documents: {}, priceLists: [] }));
  const study = { id: "E2E-OPT-STUDY", company: "Test ottimizzazione", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", createdAt: "2026-09-07", importedAt: "2026-09-07", deadline: "2026-12-31", diffRendita: -149.95,
    diffImu: 0, originalRendita: 1500.45, totalRendita: 1350.50, catDRendita: 1500.45, commercialOwner: "", technicalOwner: "Test",
    notes: "", erpUrl: "", properties };
  const unexpectedWrites: string[] = [];
  const overrides: Record<string, string> = {};
  page.on("dialog", dialog => dialog.accept());
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
    if (pathname === "/api/studies") return route.fulfill({ json: [study] });
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) unexpectedWrites.push(pathname);
    return route.fulfill({ json: pathname.includes("activities") ? [] : null });
  });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto(`/studi/${study.id}`);
  const card = page.locator(".detail-metric").filter({ has: page.getByText("Valore ottimizzazione", { exact: true }) });
  const value = card.locator(":scope > strong");
  const preview = page.getByLabel("Totali anteprima presentazione").locator(".summary-stat").filter({ hasText: "Differenza rendita" }).locator("strong");
  await expect(value).toHaveText("149,95 €");
  await expect(preview).toHaveText(await value.innerText());
  await expect(page.locator(".detail-metrics .detail-metric")).toHaveCount(5);
  for (const width of [1920, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(card).toBeVisible();
    expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const estimated = page.getByRole("textbox", { name: "Rendita catastale attribuibile per Via campione 1", exact: true });
  await estimated.fill("1000,12");
  await expect(value).toHaveText("-50,07 €");
  await expect(card.locator(".metric-symbol")).toHaveClass(/negative/);
  await expect(preview).toHaveText(await value.innerText());
  await page.getByRole("textbox", { name: "Rendita catastale attribuibile per Via campione 2", exact: true }).fill("500,33");
  await expect(value).toHaveText("0,00 €");
  await estimated.fill("");
  await expect(value).toHaveText("n.d.");
  await expect(card).toContainText("Da completare");
  await page.getByRole("button", { name: "Ripristina dati stima", exact: true }).click();
  await expect(value).toHaveText("149,95 €");
  // No financial/editor values are saved by the presentation-only overrides.
  expect(study.totalRendita).toBe(1350.50);
  expect(unexpectedWrites).toEqual([]);
});
