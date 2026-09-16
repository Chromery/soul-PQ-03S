import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("current and forecast IMU controls save and reset independently across reload", async ({ page }) => {
  test.setTimeout(90_000);
  const calculation = (rate: number, multiplier: number) => ({ status: "calculated", ratePercent: rate,
    cadastralMultiplier: multiplier, systemRatePercent: 1.06, systemCadastralMultiplier: 65,
    taxableBase: 1000 * 1.05 * multiplier, annualAmount: 1000 * 1.05 * multiplier * rate / 100,
    amount: 1000 * 1.05 * multiplier * rate / 100, rateKind: "group_d", rateYear: 2026,
    year: 2026, municipality: "Milano", province: "MI", normalizedCategory: "D/7", source: {} });
  const property = { id: "IMU-SPLIT", address: "Via prova 1", comune: "Milano", provincia: "MI", categoria: "D/7",
    currentRendita: 1000, estimatedRendita: 1000, diffPercent: 0, imuDiff: 0, outcome: "Positivo", hasStudy: true,
    currentImu: 723.45, estimatedImu: 723.45, currentImuSource: "calculated", estimatedImuSource: "calculated",
    imuRateOverride: null as number | null, imuMultiplierOverride: null as number | null,
    currentImuRateOverride: null as number | null, currentImuMultiplierOverride: null as number | null,
    currentImuCalculation: calculation(1.06, 65), imuCalculation: calculation(1.06, 65),
    notes: "", documents: {}, documentUrls: {}, priceLists: [] };
  const study = { id: "IMU-STUDY", company: "Società test IMU", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", createdAt: "2026-09-16", importedAt: "2026-09-16", deadline: "2026-12-31", diffRendita: 0,
    diffImu: 0, originalRendita: 1000, totalRendita: 1000, catDRendita: 1000, commercialOwner: "", technicalOwner: "",
    notes: "", erpUrl: "", properties: [property] };
  const writes: any[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/studies") return route.fulfill({ json: [study] });
    if (path === "/api/properties/IMU-SPLIT" && route.request().method() === "PATCH") {
      const patch = route.request().postDataJSON(); writes.push(patch); Object.assign(property, patch);
      property.currentImuCalculation = calculation(property.currentImuRateOverride ?? 1.06, property.currentImuMultiplierOverride ?? 65);
      property.imuCalculation = calculation(property.imuRateOverride ?? 1.06, property.imuMultiplierOverride ?? 65);
      property.currentImu = property.currentImuCalculation.annualAmount;
      property.estimatedImu = property.imuCalculation.annualAmount;
      return route.fulfill({ json: property });
    }
    return route.fulfill({ json: path.includes("activities") || path.endsWith("presentations") ? [] : null });
  });
  await page.goto("/"); await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto("/studi/IMU-STUDY");
  await page.locator("td.table-category-cell").click();
  const current = page.getByRole("textbox", { name: "Aliquota percentuale IMU attuale", exact: true });
  const forecast = page.getByRole("textbox", { name: "Aliquota percentuale IMU prevista", exact: true });
  await current.fill("0,9"); await current.press("Enter");
  await expect.poll(() => writes.at(-1)).toEqual({ currentImuRateOverride: 0.9 });
  await expect(forecast).toHaveValue("1,06");
  const multiplier = page.getByRole("textbox", { name: "Moltiplicatore catastale IMU prevista", exact: true });
  await multiplier.fill("80"); await multiplier.press("Enter");
  await expect.poll(() => writes.at(-1)).toEqual({ imuMultiplierOverride: 80 });
  await expect(current).toHaveValue("0,9");
  await expect(page.getByRole("textbox", { name: "Moltiplicatore catastale IMU attuale", exact: true })).toHaveValue("65");
  await page.reload(); await page.locator("td.table-category-cell").click();
  await expect(current).toHaveValue("0,9"); await expect(multiplier).toHaveValue("80");
  await page.locator('[aria-label="Override IMU attuale"]').getByRole("button", { name: "Ripristina", exact: true }).click();
  await expect.poll(() => writes.at(-1)).toEqual({ currentImuRateOverride: null });
  await expect(current).toHaveValue("1,06"); await expect(multiplier).toHaveValue("80");
});
