import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("group membership: select full group plus properties, remove individual members and confirm saved valuation reset", async ({page}) => {
  const properties = [1,2,3,4,5].map(n => ({id: `MEM-${n}`, address: `Via Membri ${n}`, ubicazione: `Via Membri ${n}`, comune: "Milano", provincia: "MI", categoria: "D/7",
    foglio: "1", particella: "2", subalterno: String(n), valuationGroupId: n < 4 ? "original" : null as string | null,
    currentRendita: 1000, estimatedRendita: 300, currentImu: 100, estimatedImu: 30, diffPercent: -70, imuDiff: -70,
    outcome: "Positivo", hasStudy: true, documents: {}, notes: "", priceLists: []}));
  const study = {id: "MEM-STUDY", company: "Test composizione gruppi", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", createdAt: "2026-09-15", importedAt: "2026-09-15", deadline: "2026-12-31", diffRendita: 0, diffImu: 0,
    originalRendita: 5000, totalRendita: 1500, catDRendita: 5000, commercialOwner: "", technicalOwner: "", notes: "", erpUrl: "", properties};
  let hasDraft = false, revision = 0;
  const writes: any[] = [], unexpected: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/studies") return route.fulfill({json: [study]});
    if (path.endsWith("/property-grouping-suggestions")) return route.fulfill({json: {pending: [], rejected: []}});
    if (path.endsWith("/members") && method === "PATCH") {
      const body = route.request().postDataJSON();
      if (hasDraft && !body.resetValuation) return route.fulfill({status: 409, json: {code: "GROUP_REVIEW_REQUIRED", message: "Confermare nuova valutazione e copia tecnica della bozza?"}});
      writes.push(body); const oldId = path.split("/").at(-2)!;
      const next = properties.filter(p => p.valuationGroupId === oldId && !(body.action === "remove" && body.propertyIds.includes(p.id))
        || body.action === "add" && body.propertyIds.includes(p.id));
      properties.filter(p => p.valuationGroupId === oldId).forEach(p => {p.valuationGroupId = null; if (hasDraft) p.estimatedRendita = 100;});
      revision++; next.forEach(p => {p.valuationGroupId = `revision-${revision}`;}); hasDraft = false;
      return route.fulfill({json: study});
    }
    if (method !== "GET") unexpected.push(path);
    return route.fulfill({json: path.endsWith("/draft") ? {overrides: {}, revision: 0} : path.includes("presentations") || path.includes("activities") ? [] : null});
  });
  await page.goto("/"); await clerk.signIn({page, emailAddress: process.env.E2E_CLERK_USER_EMAIL!});
  await page.goto("/studi/MEM-STUDY");
  const table = page.locator(".property-operational-table");
  const join = page.getByRole("button", {name: "Unisci alla valutazione complessiva", exact: true});
  const remove = page.getByRole("button", {name: "Rimuovi dal gruppo", exact: true});
  await page.getByRole("button", {name: "Espandi gruppo", exact: true}).click();
  await table.getByRole("checkbox", {name: "Seleziona Via Membri 1", exact: true}).check();
  await expect(remove).toBeEnabled();
  await table.getByRole("checkbox", {name: "Seleziona Via Membri 4", exact: true}).check();
  await expect(join).toBeDisabled(); await expect(remove).toBeDisabled();
  await table.getByRole("checkbox", {name: "Seleziona la valutazione complessiva", exact: true}).check();
  await table.getByRole("checkbox", {name: "Seleziona Via Membri 5", exact: true}).check();
  await expect(join).toBeEnabled(); await join.click();
  await expect(page.locator(".property-valuation-group-row")).toContainText("5 unità");
  expect(writes[0]).toEqual({action: "add", propertyIds: ["MEM-4", "MEM-5"], resetValuation: false});
  hasDraft = true;
  await page.getByRole("button", {name: "Espandi gruppo", exact: true}).click();
  await table.getByRole("checkbox", {name: "Seleziona Via Membri 1", exact: true}).check();
  page.once("dialog", dialog => { void dialog.accept(); page.once("dialog", next => next.dismiss()); });
  await remove.click();
  await expect(remove).toBeEnabled(); expect(writes.length).toBe(1);
  const confirm = (dialog: any) => dialog.accept(); page.on("dialog", confirm);
  await remove.click();
  await expect(page.locator(".property-valuation-group-row")).toContainText("4 unità");
  page.off("dialog", confirm);
  expect(writes[1]).toEqual({action: "remove", propertyIds: ["MEM-1"], resetValuation: true});
  expect(properties[0].valuationGroupId).toBeNull(); expect(properties[0].estimatedRendita).toBe(100);
  await page.reload(); await expect(page.locator(".property-valuation-group-row")).toContainText("4 unità");
  await expect(table.getByRole("checkbox", {name: "Seleziona Via Membri 1", exact: true})).toBeVisible();
  expect(unexpected).toEqual([]);
});
