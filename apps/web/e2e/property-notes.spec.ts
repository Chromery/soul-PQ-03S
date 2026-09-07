import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("property notes share editor storage; categories remain readable with old narrow preferences", async ({ page }) => {
  test.setTimeout(90_000);
  const property = { id: "E2E-NOTES", address: "Via campione 44", comune: "Milano", categoria: "ZONA2COMMERCIALE",
    currentRendita: 1000, estimatedRendita: 800, diffPercent: -20, imuDiff: 0, outcome: "Da verificare", hasStudy: true,
    notes: "Nota dall’editor\nSeconda riga", documents: {}, documentUrls: {}, priceLists: [] };
  const study = { id: "E2E-NOTES-STUDY", company: "Test note", vat: "", comune: "Milano", provincia: "MI", region: "Lombardia",
    status: "Aperta", createdAt: "2026-09-07", importedAt: "2026-09-07", deadline: "2026-12-31", diffRendita: 0,
    diffImu: 0, originalRendita: 1000, totalRendita: 800, catDRendita: 1000, commercialOwner: "", technicalOwner: "Test",
    notes: "Nota dello studio: non modificare", erpUrl: "", properties: [property] };
  let failSave = false;
  const writes: unknown[] = [];
  const unexpectedWrites: string[] = [];
  await page.route("**/api/**", async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname.startsWith("/api/auth/")) return route.fallback();
    if (pathname === "/api/studies") return route.fulfill({ json: [study] });
    if (pathname === `/api/properties/${property.id}` && route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON();
      writes.push(payload);
      if (failSave) return route.fulfill({ status: 500, json: { message: "Errore salvataggio campione" } });
      property.notes = payload.notes;
      return route.fulfill({ json: { notes: property.notes } });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) unexpectedWrites.push(pathname);
    return route.fulfill({ json: pathname.includes("activities") ? [] : null });
  });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.evaluate(() => {
    for (const key of ["soul-table-study-properties-v1", "soul-table-properties-archive-v1"]) {
      localStorage.setItem(key, JSON.stringify({ widths: { category: 40, location: 220 }, visibility: { sub: false } }));
    }
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/studi/${study.id}`);
  const category = page.locator("td.table-category-cell");
  await expect(category).toHaveText(property.categoria);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("soul-table-study-properties-v1")!))).toMatchObject({
    widths: { category: 90, location: 220 }, visibility: { sub: false },
  });
  for (const width of [1280, 1024, 768]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await category.evaluate(el => ({ overflow: el.scrollWidth > el.clientWidth + 1, ellipsis: getComputedStyle(el).textOverflow })))
      .toEqual({ overflow: false, ellipsis: "clip" });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await category.click();
  const modal = page.getByRole("dialog", { name: "Lista aree", exact: true });
  const notes = modal.getByRole("region", { name: "Note immobile", exact: true });
  await expect(notes).toContainText(property.notes);
  await expect(modal.getByText("Nessuna lista aree salvata", { exact: true })).toBeVisible();
  await notes.getByRole("button", { name: "Modifica", exact: true }).click();
  await notes.getByRole("textbox").fill("Da annullare");
  await notes.getByRole("button", { name: "Annulla", exact: true }).click();
  expect(writes).toHaveLength(0);
  await notes.getByRole("button", { name: "Modifica", exact: true }).click();
  await notes.getByRole("textbox").fill("Nota dal dettaglio\nRiga aggiornata");
  failSave = true;
  await notes.getByRole("button", { name: "Salva note", exact: true }).click();
  await expect(page.getByText("Errore salvataggio campione", { exact: true })).toBeVisible();
  await expect(notes.getByRole("textbox")).toHaveValue("Nota dal dettaglio\nRiga aggiornata");
  failSave = false;
  await notes.getByRole("button", { name: "Salva note", exact: true }).click();
  await expect(notes.getByRole("textbox")).toHaveCount(0);
  expect(writes.at(-1)).toEqual({ notes: "Nota dal dettaglio\nRiga aggiornata" });
  await modal.getByRole("button", { name: "Chiudi lista aree" }).click();
  await expect(page.getByRole("region", { name: "Note studio", exact: true })).toContainText(study.notes);
  await category.click();
  await expect(notes).toContainText(property.notes);
  await modal.getByRole("button", { name: "Editor", exact: true }).click();
  const editorNotes = page.getByRole("textbox", { name: "Note del singolo immobile", exact: true });
  await expect(editorNotes).toHaveValue(property.notes);
  await editorNotes.fill("Aggiornata dall’editor");
  await page.getByRole("button", { name: "Salva note", exact: true }).click();
  await expect.poll(() => property.notes).toBe("Aggiornata dall’editor");
  await page.goto(`/studi/${study.id}`);
  await category.click();
  await expect(notes).toContainText("Aggiornata dall’editor");
  await notes.getByRole("button", { name: "Modifica", exact: true }).click();
  await notes.getByRole("textbox").fill("");
  await notes.getByRole("button", { name: "Salva note", exact: true }).click();
  await expect(notes.getByRole("button", { name: "Aggiungi nota", exact: true })).toBeVisible();
  await page.reload();
  await category.click();
  await expect(notes.getByText("Nessuna nota inserita.", { exact: true })).toBeVisible();
  await page.goto("/immobili");
  await expect(category).toHaveText(property.categoria);
  expect(await category.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(unexpectedWrites).toEqual([]);
});
