import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { chromium } from "playwright-core";
import { groupPresentationRows, combineCadastralReferences } from "../src/presentations/presentation-grouping.js";
import { validateDraftChanges, mergeDraftChanges } from "../src/presentations/presentation-draft.js";
import { PresentationsService } from "../src/presentations/presentations.service.js";
import type { PresentationPropertySnapshot } from "../src/presentations/presentations.types.js";

const rows = (): PresentationPropertySnapshot[] => ["1", "2", "3"].map((id, i) => ({ id, outcome: i === 1 ? "Negativo" : "Positivo",
  societa: "Società campione", comune: "Milano (MI)", indirizzo: "Via Roma 44", foglioParticellaSub: `Fg. 12 - Part. 34 - Sub. ${id}`,
  categoria: "D/7", renditaAttuale: [100.10, 200.20, 300.30][i], renditaAttribuibile: [50, 250, 200][i],
  imuAttuale: [10, 20, 30][i], imuOttenibile: [5, 25, 20][i] }));
const sources = [{ id: "1", valuationGroupId: "g1" }, { id: "2", valuationGroupId: "g1" }, { id: "3" }];

test("presentation groups default from valuation groups, aggregate exact cents and retain each sub", () => {
  const input = rows(), before = structuredClone(input);
  const result = groupPresentationRows(input, sources, {});
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].memberIds, ["1", "2"]);
  assert.equal(result[0].renditaAttuale, 300.30);
  assert.equal(result[0].renditaAttribuibile, 300);
  assert.equal(result[0].imuAttuale, 30);
  assert.equal(result[0].outcome, "Misto");
  assert.equal(result[0].foglioParticellaSub, "Fg. 12 - Part. 34 - Sub. 1, 2");
  assert.deepEqual(input, before);
});

test("group overrides dissolve, regroup and reset without losing amounts; only selected sources count", () => {
  const changes = validateDraftChanges({ changes: { "1:presentationGroup": "", "2:presentationGroup": "" } }, new Set(["1", "2", "3"]));
  const overrides = mergeDraftChanges({}, changes);
  assert.equal(groupPresentationRows(rows(), sources, overrides).length, 3);
  const manual = { ...overrides, "1:presentationGroup": "manual:new", "3:presentationGroup": "manual:new" };
  const grouped = groupPresentationRows(rows(), sources, manual);
  assert.deepEqual(grouped[0].memberIds, ["1", "3"]);
  assert.equal(grouped[0].renditaAttuale, 400.40);
  assert.equal(groupPresentationRows([rows()[0]], sources, {}).length, 1);
  assert.equal(groupPresentationRows([rows()[0]], sources, {})[0].renditaAttuale, 100.10);
  assert.equal(groupPresentationRows(rows(), sources, mergeDraftChanges(overrides, { "1:presentationGroup": null, "2:presentationGroup": null })).length, 2);
  for (const changes of [{ "foreign:presentationGroup": "manual:new" }, { "1:presentationGroup": "<script>" }, { "1:presentationGroup": [] }])
    assert.throws(() => validateDraftChanges({ changes }, new Set(["1"])));
});

test("missing group IMU stays unknown; distinct companies, categories and cadastral references are preserved", () => {
  const input = rows(); input[1].imuAttuale = null; input[1].societa = "Altra società"; input[1].categoria = "D/8";
  input[1].foglioParticellaSub = "Fg. 99 - Part. 10 - Sub. 2";
  const result = groupPresentationRows(input, sources, {});
  assert.equal(result[0].imuAttuale, null);
  assert.equal(result[0].imuOttenibile, 30);
  assert.equal(result[0].societa, "Società campione / Altra società");
  assert.equal(result[0].categoria, "D/7 / D/8");
  assert.equal(result[0].foglioParticellaSub, "Fg. 12 - Part. 34 - Sub. 1 / Fg. 99 - Part. 10 - Sub. 2");
  assert.equal(combineCadastralReferences(["Riferimento manuale", "Riferimento manuale"]), "Riferimento manuale");
});

function serviceFixture() {
  let saved: any;
  let overrides: Record<string, string> = {};
  const properties = rows().map((row, i) => ({ ...row, ...sources[i], address: row.indirizzo, humanReadableAddress: row.indirizzo,
    foglio: "12", particella: "34", subalterno: row.id, provincia: "MI", currentRendita: row.renditaAttuale,
    estimatedRendita: row.renditaAttribuibile, currentImu: row.imuAttuale, estimatedImu: row.imuOttenibile }));
  const study = { id: "study", company: "Società campione", vat: "", comune: "Milano", provincia: "MI", properties,
    commercialOwner: "", technicalOwner: "" };
  const prisma = { presentationDraft: { findUnique: async () => ({ overrides }) },
    studyGroup: { findUnique: async () => ({ id: "group", name: "Portafoglio", studies: [{ id: "study" }] }) },
    presentationDeck: { create: async ({ data }: any) => { saved = { ...data, id: "deck", createdAt: new Date() }; return saved; },
      findUnique: async () => saved } };
  const service = new PresentationsService(prisma as never, { find: async () => study } as never, {} as never,
    { get: (_key: string, fallback: unknown) => fallback } as never);
  return { service, snapshot: () => saved.snapshot, setOverrides: (value: Record<string, string>) => { overrides = value; } };
}

test("generated study and study-group snapshots freeze grouping, keep individual rows and positive-only optimization", async () => {
  const fixture = serviceFixture();
  await fixture.service.createV3("study", ["3", "1", "2"]);
  const snapshot = structuredClone(fixture.snapshot());
  assert.equal(snapshot.reductionBasis, "per-row");
  assert.ok(snapshot.tableRows.every((row: any) => row.reductionBasis === "rent"));
  assert.deepEqual(snapshot.immobili.map((row: any) => row.id), ["3", "1", "2"]);
  assert.equal(snapshot.tableRows.length, 2);
  assert.equal(snapshot.optimizationValue, 150.40);
  fixture.setOverrides({ "1:presentationGroup": "", "2:presentationGroup": "" });
  await fixture.service.createStudyGroupV3("group", ["1", "2", "3"]);
  assert.equal(fixture.snapshot().tableRows.length, 3);
  assert.equal(fixture.snapshot().studio.company, "Portafoglio");
  assert.equal(snapshot.tableRows.length, 2);
  assert.equal(fixture.snapshot().optimizationValue, snapshot.optimizationValue);
  fixture.setOverrides({ "group:valuation:g1:reductionBasis": "imu", "3:reductionBasis": "imu" });
  await fixture.service.createV3("study", ["1", "3"]);
  assert.equal(fixture.snapshot().tableRows.length, 2);
  assert.equal(fixture.snapshot().immobili.length, 2);
  assert.ok(fixture.snapshot().tableRows.every((row: any) => row.reductionBasis === "imu"));
  assert.ok(snapshot.tableRows.every((row: any) => row.reductionBasis === "rent"));
});

test("grouped v3 renders one row per group and a complete six-page PDF", { skip: !existsSync("/usr/bin/chromium"), timeout: 90000 }, async () => {
  const fixture = serviceFixture();
  await fixture.service.createV3("study", ["1", "2", "3"]);
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  try {
    const html = await (fixture.service as any).renderSnapshot(fixture.snapshot());
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#property-rows tr").count(), 2);
    assert.match(await page.locator("#property-rows tr").first().innerText(), /Sub\. 1, 2/);
    assert.match(await page.locator("#rent-difference").innerText(), /150,40/);
    if (process.env.PQ_GROUPING_REVIEW_DIR) await page.locator("#slide-5").screenshot({ path: `${process.env.PQ_GROUPING_REVIEW_DIR}/grouped-slide.png` });
    const { pdf } = await fixture.service.renderPdf("deck");
    assert.equal((await PDFDocument.load(pdf)).getPageCount(), 6);
  } finally { await browser.close(); await fixture.service.onModuleDestroy(); }
});
