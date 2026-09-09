import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

for (const group of [false, true]) test(`presentation ${group ? "group" : "study"}: persistent edits, generator sorting, immutable history and delete`, async ({ page }) => {
  const properties = ["Neutro", "Sospeso", "Negativo", "Positivo", "Positivo"].map((outcome, i) => ({
    id: `HISTORY-${i}`, address: `Via test ${i}`, comune: "Milano", provincia: "MI", categoria: "D/7",
    foglio: "1", particella: String(i), subalterno: "1", currentRendita: [20, 100, 3, 12, 2][i],
    estimatedRendita: 1, currentImu: 10, estimatedImu: 1, diffPercent: 0,
    imuDiff: 0, outcome, hasStudy: true, notes: "", documents: {}, priceLists: [],
  }));
  const study = { id: "HISTORY-STUDY", studyGroupId: "HISTORY-GROUP", studyGroupName: "Gruppo campione",
    company: "Test storico", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", concludedAt: null, createdAt: "2026-09-09", importedAt: "2026-09-09",
    deadline: "2026-12-31", diffRendita: 0, diffImu: 0, originalRendita: 137, totalRendita: 5,
    catDRendita: 137, commercialOwner: "", technicalOwner: "Test", notes: "", erpUrl: "", properties };
  const endpoint = group ? "/api/study-groups/HISTORY-GROUP/presentations" : "/api/studies/HISTORY-STUDY/presentations";
  const overrides: Record<string, string> = {};
  const snapshots: any[] = [], deletes: string[] = [], unexpected: string[] = [];
  let failSave = false;
  const deck = (i: number) => ({ id: `deck-${i}`, version: 3, studyId: study.id, studyGroupId: group ? "HISTORY-GROUP" : null,
    propertyIds: ["HISTORY-3"], propertyCount: 1, fileName: `Presentazione-${i}.pdf`, createdAt: "2026-09-09T15:00:00Z",
    htmlUrl: null, htmlDownloadUrl: null, pdfUrl: `/api/presentations/deck-${i}/pdf` });
  let history = Array.from({ length: 25 }, (_, i) => deck(25 - i));
  await page.route("**/api/**", async route => {
    const { pathname } = new URL(route.request().url()), method = route.request().method();
    if (pathname.startsWith("/api/auth/")) return route.fallback();
    if (pathname === "/api/studies") return route.fulfill({ json: [study, { ...study, id: "HISTORY-SECOND", company: "Seconda società", properties: [] }] });
    if (pathname.endsWith("/presentations/draft")) {
      if (method === "PATCH") {
        expect(pathname).toBe(`${endpoint}/draft`);
        if (failSave) return route.fulfill({ status: 503, json: { message: "Test offline" } });
        for (const [key, value] of Object.entries(route.request().postDataJSON().changes)) {
          if (value === null) delete overrides[key]; else overrides[key] = value as string;
        }
      }
      return route.fulfill({ json: { overrides, revision: 1 } });
    }
    if (pathname === endpoint && method === "GET") return route.fulfill({ json: history });
    if (pathname === `${endpoint}/v3` && method === "POST") {
      snapshots.push(route.request().postDataJSON()); const created = deck(26); history = [created, ...history];
      return route.fulfill({ json: created });
    }
    if (pathname.startsWith("/api/presentations/") && method === "DELETE") {
      const id = pathname.split("/").at(-1)!; deletes.push(id); history = history.filter(item => item.id !== id);
      return route.fulfill({ json: { deleted: true } });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) unexpected.push(pathname);
    return route.fulfill({ json: pathname.includes("activities") || pathname.endsWith("/presentations") ? [] : null });
  });
  await page.goto("/"); await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto(group ? "/gruppi-studio/HISTORY-GROUP" : "/studi/HISTORY-STUDY");
  const preview = page.locator("#presentation-data");
  const address = preview.getByRole("textbox", { name: "indirizzo per HISTORY-3", exact: true });
  const saved = () => expect(preview.getByRole("status")).toContainText("Modifiche salvate");
  await address.fill("Via modificata 44");
  await preview.getByLabel("Cliente mostrato in copertina").fill("Cliente personalizzato");
  await saved();
  await page.reload(); await expect(address).toHaveValue("Via modificata 44");
  await expect(preview.getByLabel("Cliente mostrato in copertina")).toHaveValue("Cliente personalizzato");
  properties[3].address = "Indirizzo ERP aggiornato";
  properties[4].address = "Via ERP non modificata";
  await page.reload(); await expect(address).toHaveValue("Via modificata 44");
  await expect(preview.getByRole("textbox", { name: "indirizzo per HISTORY-4", exact: true })).toHaveValue("Via ERP non modificata");
  failSave = true; await address.fill("Via salvata dopo errore");
  await expect(preview.getByRole("status")).toContainText("Modifiche non salvate");
  await expect(address).toHaveValue("Via salvata dopo errore");
  failSave = false; await preview.getByRole("button", { name: "Riprova", exact: true }).click(); await saved();
  await page.getByRole("button", { name: "Generazione PDF v3", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Generazione PDF v3", exact: true });
  for (const width of [1280, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const box = await modal.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width).toBeTruthy();
    expect(await modal.locator(".presentation-generator-table-wrap").evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const ids = () => modal.locator("tbody tr").evaluateAll(rows => rows.map(row => row.getAttribute("data-property-id")));
  await expect.poll(ids).toEqual(["HISTORY-3", "HISTORY-4", "HISTORY-2", "HISTORY-1", "HISTORY-0"]);
  await modal.getByRole("button", { name: "R.C. attuale (€)", exact: true }).click();
  await expect.poll(ids).toEqual(["HISTORY-4", "HISTORY-2", "HISTORY-3", "HISTORY-0", "HISTORY-1"]);
  await modal.getByRole("button", { name: "R.C. attuale (€)", exact: true }).click();
  await expect.poll(ids).toEqual(["HISTORY-1", "HISTORY-0", "HISTORY-3", "HISTORY-2", "HISTORY-4"]);
  await expect(modal.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await modal.getByRole("button", { name: "Genera PDF v3", exact: true }).click();
  await expect(modal.getByText("PDF v3 pronto", { exact: true })).toBeVisible();
  expect(snapshots[0].clientName).toBe("Cliente personalizzato");
  expect(snapshots[0].properties.find((item: any) => item.id === "HISTORY-3").indirizzo).toBe("Via salvata dopo errore");
  await modal.getByRole("button", { name: "Chiudi", exact: true }).last().click();
  await address.fill("Modifica successiva al PDF"); await saved();
  expect(snapshots[0].properties.find((item: any) => item.id === "HISTORY-3").indirizzo).toBe("Via salvata dopo errore");
  await page.getByRole("button", { name: "Storico presentazioni", exact: true }).click();
  const historyModal = page.getByRole("dialog", { name: "Storico presentazioni", exact: true });
  await expect(historyModal.locator("article")).toHaveCount(20);
  await historyModal.getByRole("button", { name: "Mostra altre (6)", exact: true }).click();
  await expect(historyModal.locator("article")).toHaveCount(26);
  page.once("dialog", dialog => dialog.dismiss());
  await historyModal.getByRole("button", { name: "Elimina Presentazione-26.pdf", exact: true }).click();
  expect(deletes).toHaveLength(0);
  page.once("dialog", dialog => dialog.accept());
  await historyModal.getByRole("button", { name: "Elimina Presentazione-26.pdf", exact: true }).click();
  await expect(historyModal.locator("article")).toHaveCount(25);
  expect(deletes).toEqual(["deck-26"]);
  await historyModal.getByRole("button", { name: "Chiudi storico", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await preview.getByRole("button", { name: "Ripristina dati stima", exact: true }).click();
  await saved(); await page.reload();
  await expect(address).toHaveValue("Indirizzo ERP aggiornato");
  await expect(preview.getByLabel("Cliente mostrato in copertina")).toHaveValue(group ? "Gruppo campione" : "Test storico");
  expect(history).toHaveLength(25); expect(unexpected).toEqual([]);
});
