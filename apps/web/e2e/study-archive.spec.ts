import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("selected studies can be archived and restored without changing import date or outcome", async ({ page }) => {
  const studies = [false, true].map((isTest, i) => ({ id: `ARCHIVE-${i}`, company: `Società archivio ${i}`, isTest,
    vat: "", comune: "Milano", provincia: "MI", region: "Lombardia", status: "Aperta",
    createdAt: "2026-09-15", importedAt: "2026-09-15", deadline: "2026-12-31", diffRendita: 0,
    diffImu: 0, originalRendita: 1000, totalRendita: 1000, catDRendita: 1000, commercialOwner: "", technicalOwner: "",
    notes: "", erpUrl: "", properties: [] }));
  const writes: any[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/studies") return route.fulfill({ json: studies });
    if (path === "/api/studies/archive") {
      const payload = route.request().postDataJSON(); writes.push(payload);
      for (const study of studies) if (payload.studyIds.includes(study.id)) study.isTest = payload.archived;
      return route.fulfill({ json: { ...payload, updated: payload.studyIds.length } });
    }
    return route.fulfill({ json: path.includes("activities") ? [] : null });
  });
  await page.goto("/"); await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto("/studi");
  const row = (name: string) => page.locator("tr").filter({ hasText: name });
  await expect(row("Società archivio 0")).toHaveCount(1);
  await expect(row("Società archivio 1")).toHaveCount(0);
  await row("Società archivio 0").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Archivia selezionati", exact: true }).click();
  await expect(row("Società archivio 0")).toHaveCount(0);
  await page.getByRole("button", { name: /Mostra archivio/ }).click();
  await expect(row("Società archivio 0")).toContainText("Archiviato");
  for (const name of ["Società archivio 0", "Società archivio 1"]) await row(name).getByRole("checkbox").check();
  await page.getByRole("button", { name: "Ripristina dall’archivio", exact: true }).click();
  await page.getByRole("button", { name: /Nascondi archivio/ }).click();
  await expect(row("Società archivio 0")).toHaveCount(1);
  await expect(row("Società archivio 1")).toHaveCount(1);
  await page.reload();
  await expect(row("Società archivio 1")).toHaveCount(1);
  expect(writes).toEqual([{ studyIds: ["ARCHIVE-0"], archived: true }, { studyIds: ["ARCHIVE-0", "ARCHIVE-1"], archived: false }]);
  expect(studies.every(s => s.status === "Aperta" && s.importedAt === "2026-09-15")).toBe(true);
});
