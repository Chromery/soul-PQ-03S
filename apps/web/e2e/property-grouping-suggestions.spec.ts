import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("suggested groups review: badge, persistent refusals, later acceptance, errors and responsive dialog", async ({ page }) => {
  const properties = [1, 2, 3, 4].map(n => ({ id: `SUG-${n}`, address: `Via delle Industrie ${n}`, comune: "Bergamo", provincia: "BG",
    foglio: "12", particella: n < 3 ? "44" : "55", subalterno: String(n), valuationGroupId: null as string | null,
    categoria: "D/7", currentRendita: 1000 * n, estimatedRendita: 500 * n, currentImu: 100, estimatedImu: 50,
    diffPercent: -50, imuDiff: -50, outcome: "Positivo", hasStudy: true, notes: "", documents: {}, priceLists: [] }));
  const study = { id: "SUG-STUDY", company: "Società campione", vat: "", comune: "Bergamo", provincia: "BG", region: "Lombardia",
    status: "Aperta", createdAt: "2026-09-15", importedAt: "2026-09-15", deadline: "2026-12-31", diffRendita: -5000,
    diffImu: -200, originalRendita: 10000, totalRendita: 5000, catDRendita: 10000, commercialOwner: "", technicalOwner: "", notes: "", erpUrl: "", properties };
  const rejected = new Set<string>();
  const reviews: any[] = [], unexpected: string[] = [];
  let fail = false;
  const suggestions = () => {
    const items = ["a", "b"].map((letter, i) => ({ id: letter.repeat(64), propertyIds: properties.slice(i * 2, i * 2 + 2).map(p => p.id),
      comune: "Bergamo", provincia: "BG", sezione: "", foglio: "12", matchField: "particella", matchValue: i ? "55" : "44" }))
      .filter(item => item.propertyIds.every(id => !properties.find(p => p.id === id)?.valuationGroupId));
    return { pending: items.filter(item => !rejected.has(item.id)), rejected: items.filter(item => rejected.has(item.id)).map(item => ({ ...item, rejectedAt: "2026-09-15T12:00:00Z" })) };
  };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/studies") return route.fulfill({ json: [study] });
    if (path.includes("/property-grouping-suggestions")) {
      if (method === "POST") {
        if (fail) return route.fulfill({ status: 503, json: { message: "Test error" } });
        const signature = path.split("/").pop()!, { action } = route.request().postDataJSON();
        reviews.push({ signature, action });
        if (action === "reject") rejected.add(signature);
        else for (const property of properties.slice(signature.startsWith("a") ? 0 : 2, signature.startsWith("a") ? 2 : 4)) property.valuationGroupId = `accepted-${signature[0]}`;
        return route.fulfill({ json: { ...suggestions(), study: action === "accept" ? study : null } });
      }
      return route.fulfill({ json: suggestions() });
    }
    if (method !== "GET") unexpected.push(path);
    return route.fulfill({ json: path.endsWith("/draft") ? { overrides: {}, revision: 0 } : path.includes("presentations") || path.includes("activities") ? [] : null });
  });
  await page.goto("/"); await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto("/studi/SUG-STUDY");
  const button = page.getByRole("button", { name: "Gruppi suggeriti: 2 da rivedere", exact: true });
  await expect(button.locator(".suggestion-count")).toHaveText("2");
  await expect(button.locator(".suggestion-count")).toHaveCSS("color", "rgb(255, 255, 255)");
  await button.click();
  const modal = page.getByRole("dialog", { name: "Gruppi suggeriti", exact: true });
  await expect(modal.locator("article")).toHaveCount(2);
  await expect(modal.getByRole("heading", { name: "Gruppi suggeriti", exact: true })).toHaveCSS("color", "rgb(255, 255, 255)");
  for (const width of [1366, 1024, 390]) {
    await page.setViewportSize({ width, height: 768 });
    const box = await modal.boundingBox(); expect(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 768).toBeTruthy();
    await expect(modal.getByRole("button", { name: "Chiudi gruppi suggeriti" })).toBeVisible();
    const card = await modal.locator("article").first().boundingBox();
    expect(card && card.x >= 0 && card.x + card.width <= width).toBeTruthy();
    if (width === 390 && process.env.PQ_SUGGESTIONS_REVIEW_DIR) await modal.screenshot({ path: `${process.env.PQ_SUGGESTIONS_REVIEW_DIR}/mobile.png` });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  if (process.env.PQ_SUGGESTIONS_REVIEW_DIR) await modal.screenshot({ path: `${process.env.PQ_SUGGESTIONS_REVIEW_DIR}/pending.png` });
  const first = modal.getByRole("article", { name: "Foglio 12 · Particella 44 · Bergamo" });
  const reject = first.getByRole("button", { name: "Rifiuta Foglio 12 · Particella 44", exact: true });
  await expect(reject).toHaveText("");
  fail = true; await reject.click(); await expect(modal.getByRole("alert")).toContainText("Operazione non riuscita");
  expect(rejected.size).toBe(0); await expect(page.locator(".suggestion-count")).toHaveText("2");
  fail = false; await reject.click();
  await expect(modal.locator("article")).toHaveCount(1); await expect(page.locator(".suggestion-count")).toHaveText("1");
  await page.keyboard.press("Escape"); await expect(modal).not.toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Gruppi suggeriti: 1 da rivedere", exact: true }).click();
  await modal.getByRole("button", { name: "Rifiutati 1", exact: true }).click();
  await expect(modal.locator("article")).toHaveCount(1);
  await expect(modal.getByRole("button", { name: /Rifiuta Foglio/ })).toHaveCount(0);
  if (process.env.PQ_SUGGESTIONS_REVIEW_DIR) await modal.screenshot({ path: `${process.env.PQ_SUGGESTIONS_REVIEW_DIR}/rejected.png` });
  await modal.getByRole("button", { name: "Accetta Foglio 12 · Particella 44", exact: true }).click();
  await expect(modal.getByRole("heading", { name: "Nessun suggerimento rifiutato" })).toBeVisible();
  expect(properties.slice(0, 2).every(property => property.valuationGroupId === "accepted-a")).toBe(true);
  await modal.getByRole("button", { name: "Da rivedere 1", exact: true }).click();
  await modal.getByRole("button", { name: "Rifiuta Foglio 12 · Particella 55", exact: true }).click();
  await expect(modal.getByRole("heading", { name: "Nessun gruppo da rivedere" })).toBeVisible();
  await expect(page.locator(".suggestion-count")).toHaveCount(0);
  await expect(page.locator(".suggestion-trigger")).not.toHaveClass(/has-pending/);
  await modal.getByRole("button", { name: "Chiudi gruppi suggeriti", exact: true }).click();
  await expect(page.locator(".suggestion-trigger")).toBeFocused();
  await page.reload(); await expect(page.getByRole("button", { name: "Gruppi suggeriti: 0 da rivedere", exact: true })).toBeVisible();
  expect(reviews.map(review => review.action)).toEqual(["reject", "accept", "reject"]);
  expect(properties.map(property => property.currentRendita)).toEqual([1000, 2000, 3000, 4000]);
  expect(unexpected).toEqual([]);
});
