import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";

test("price catalog requires authentication and serves the exact source to a staging operator", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  for (const path of [
    "/api/price-rules/catalog",
    "/api/price-rules/export.csv",
    "/api/price-rules/suggestions?province=MI",
    "/api/price-rules/context?municipality=Milano",
    "/api/price-rules/documents/invalid/source",
  ])
    expect((await request.get(path)).status()).toBe(401);
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  const result = await page.evaluate(async () => {
    const catalog = await (await fetch("/api/price-rules/catalog")).json();
    const source = catalog.documents.find((d: any) => d.title === "Milano.pdf");
    const response = await fetch(
      `/api/price-rules/documents/${source.id}/source`,
    );
    return {
      catalog,
      source,
      bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
      mime: response.headers.get("content-type"),
      status: response.status,
      invalid: (await fetch("/api/price-rules/suggestions?height=-1")).status,
      context: await (
        await fetch(
          "/api/price-rules/context?municipality=Milano&province=Milano",
        )
      ).json(),
    };
  });
  expect(result.catalog.totals.files).toBe(120);
  expect(result.catalog.totals.documents).toBe(116);
  expect(result.status).toBe(200);
  expect(result.mime).toContain("application/pdf");
  expect(
    createHash("sha256").update(Buffer.from(result.bytes)).digest("hex"),
  ).toBe(result.source.sha256);
  expect(result.invalid).toBe(400);
  expect(result.context.province).toBe("MI");
});

test("price laboratory filters documented variants", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto("/prezzari");
  await expect(
    page.getByRole("heading", { name: "Il prezzo giusto parte dalla fonte." }),
  ).toBeVisible();
  await page.getByLabel("Provincia", { exact: true }).selectOption("MI");
  await expect(page.locator(".price-card").first()).toContainText("165");
  await page.getByText("Caratteristiche e fonti", { exact: true }).click();
  await page.getByLabel("Luce strutturale (m)").fill("20");
  await expect(page.locator(".price-card").first()).toContainText("214");
  await page.getByLabel("Altezza equivalente (m)").fill("7");
  await expect(page.locator(".price-card-value>b").first()).toContainText(
    "235,4",
  );
  await page.getByLabel("Altezza equivalente (m)").fill("");
  await page.getByLabel("Luce strutturale (m)").fill("");
  await page
    .getByLabel("Tipologia area", { exact: true })
    .selectOption("uffici");
  await expect(
    page.getByText("Altezza equivalente necessaria", { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel("Altezza equivalente (m)").fill("3");
  await expect(page.locator(".price-results.is-loading")).toHaveCount(0);
  await expect(
    page
      .locator(".price-card")
      .filter({ hasText: "Palazzina per uffici" })
      .locator(".price-card-value>b"),
  ).toContainText("465");
  await expect(
    page.locator(".price-card").filter({ hasText: "Centro commerciale" }),
  ).toHaveCount(0);
});

test("price laboratory remains usable at small widths", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto("/prezzari");
  await page.getByLabel("Provincia", { exact: true }).selectOption("MI");
  await expect(page.locator(".price-card").first()).toBeVisible();
  await expect(page.locator(".price-results.is-loading")).toHaveCount(0);
  for (const width of [1366, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    if (process.env.PQ_GROUPING_REVIEW_DIR)
      await page.screenshot({
        path: `${process.env.PQ_GROUPING_REVIEW_DIR}/prezzari-${width}.png`,
      });
  }
});

test("Lecco formulas require the building surface and calculate the selected variant", async ({
  page,
}) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto("/prezzari");
  await page.getByLabel("Provincia", { exact: true }).selectOption("LC");
  await page.getByText("Caratteristiche e fonti", { exact: true }).click();
  await page.getByLabel("Superficie di riferimento edificio (m²)").fill("600");
  await page.getByLabel("Altezza equivalente (m)").fill("5");
  await expect(page.locator(".price-results.is-loading")).toHaveCount(0);
  const flatRoof = page
    .locator(".price-card")
    .filter({ hasText: "copertura piana" });
  await expect(flatRoof).toHaveCount(1);
  await expect(flatRoof.locator(".price-card-value>b")).toContainText("207,83");
  await page.getByLabel("Superficie di riferimento edificio (m²)").fill("");
  await expect(flatRoof.filter({ hasText: "501 e 1600" })).toContainText(
    "Superficie di riferimento dell’edificio necessaria",
  );
});

test("editor price choice is explicit, avoids duplicate charges, persists provenance and supports undo", async ({
  page,
}) => {
  test.setTimeout(120000);
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 400]).drawText("PREZZI TEST", { x: 40, y: 200 });
  const bytes = Buffer.from(await pdf.save());
  const document = {
    kind: "remote",
    fileName: "price-test.pdf",
    url: "/api/e2e/price-test.pdf",
  };
  const property = {
    id: "PRICE-P",
    address: "Via di prova 1",
    comune: "Milano",
    provincia: "MI",
    categoria: "D/7",
    currentRendita: 1000,
    estimatedRendita: 800,
    diffPercent: -20,
    imuDiff: 0,
    outcome: "Positivo",
    hasStudy: true,
    notes: "",
    priceLists: [],
    documents: { planimetria: document.fileName },
    documentUrls: { planimetria: document.url },
  };
  const study = {
    id: "PRICE-S",
    company: "Campione prezzari",
    vat: "",
    comune: "Milano",
    provincia: "MI",
    region: "Lombardia",
    status: "Aperta",
    createdAt: "2026-09-19",
    importedAt: "2026-09-19",
    deadline: "2026-12-31",
    diffRendita: -200,
    diffImu: 0,
    originalRendita: 1000,
    totalRendita: 800,
    catDRendita: 1000,
    commercialOwner: "",
    technicalOwner: "",
    notes: "",
    erpUrl: "",
    properties: [property],
  };
  let draft: any = {
    version: 1,
    propertyId: property.id,
    document,
    selections: [],
    sheetSize: "A3",
    scaleDenominator: 200,
    activeUsage: "capannone",
    defaultOneri: true,
  };
  let saves = 0;
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/auth/") || path.startsWith("/api/price-rules/"))
      return route.fallback();
    if (path === "/api/studies") return route.fulfill({ json: [study] });
    if (path === document.url)
      return route.fulfill({ contentType: "application/pdf", body: bytes });
    if (path.endsWith("/analysis-draft")) {
      if (route.request().method() === "PUT") {
        draft = route.request().postDataJSON();
        saves++;
      }
      return route.fulfill({ json: draft });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method()))
      unexpected.push(path);
    return route.fulfill({ json: path.includes("activities") ? [] : null });
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto(`/studi/${study.id}/immobili/${property.id}/planimetria`);
  await expect(
    page.getByRole("button", { name: "Ruota pagina a destra", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Aggiungi riga manuale", exact: true })
    .click();
  const save = async () => {
    const before = saves;
    await page
      .getByRole("button", { name: "Salva bozza", exact: true })
      .click();
    await expect.poll(() => saves).toBe(before + 1);
  };
  await save();
  const originalRate = draft.selections[0].rate;
  await page
    .getByLabel("Applica oneri all'area 1", { exact: true })
    .first()
    .check();
  await page
    .getByRole("button", { name: "Suggerisci prezzo per area 1", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Scegli il prezzo dell’area",
  });
  await expect(dialog.getByLabel("Provincia", { exact: true })).toHaveValue(
    "MI",
  );
  await dialog
    .locator(".price-card")
    .first()
    .getByRole("button", { name: "Valuta questa proposta" })
    .click();
  const apply = dialog.getByRole("button", {
    name: "Applica soltanto a questa area",
  });
  await expect(apply).toBeDisabled();
  await dialog.getByLabel("Ho verificato unità", { exact: false }).check();
  await expect(apply).toBeDisabled();
  await dialog
    .getByLabel("Rimuovi gli oneri aggiuntivi", { exact: false })
    .check();
  await expect(apply).toBeEnabled();
  if (process.env.PQ_GROUPING_REVIEW_DIR)
    await dialog.screenshot({
      path: `${process.env.PQ_GROUPING_REVIEW_DIR}/prezzari-conferma.png`,
    });
  await apply.click();
  await expect(dialog).not.toBeVisible();
  await save();
  expect(draft.selections[0].rate).toBe(165);
  expect(draft.selections[0].oneri).toBe(false);
  expect(draft.selections[0].priceProvenance.documentId).toHaveLength(64);
  await page.keyboard.press("Control+z");
  await save();
  expect(draft.selections[0].rate).toBe(originalRate);
  expect(draft.selections[0].oneri).toBe(true);
  await page.keyboard.press("Control+Shift+z");
  await save();
  expect(draft.selections[0].rate).toBe(165);
  await page.reload();
  await expect(
    page
      .getByRole("button", {
        name: "Suggerisci prezzo per area 1",
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await save();
  expect(draft.selections[0].priceProvenance.rate).toBe(165);
  draft.selections[0].amountOverride = 5000;
  await page.reload();
  await page
    .getByRole("button", { name: "Suggerisci prezzo per area 1", exact: true })
    .first()
    .click();
  await dialog
    .locator(".price-card")
    .first()
    .getByRole("button", { name: "Valuta questa proposta" })
    .click();
  await dialog.getByLabel("Ho verificato unità", { exact: false }).check();
  await expect(apply).toBeDisabled();
  await dialog
    .getByLabel("Rimuovi il totale manuale", { exact: false })
    .check();
  await apply.click();
  await save();
  expect(draft.selections[0].amountOverride).toBe(null);
  const rate = page
    .getByLabel("Prezzo unitario area 1", { exact: true })
    .first();
  await rate.fill("166");
  await rate.press("Enter");
  await save();
  expect(draft.selections[0].priceProvenance).toBeUndefined();
  expect(draft.selections[0].rate).toBe(166);
  expect(unexpected).toEqual([]);
});
