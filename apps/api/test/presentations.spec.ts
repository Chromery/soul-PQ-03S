import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import { PresentationsService } from "../src/presentations/presentations.service.js";
import type { PresentationSnapshot } from "../src/presentations/presentations.types.js";

function studyFixture() {
  return {
    id: "studio-1",
    company: "Cliente S.p.A.",
    vat: "IT01234567890",
    comune: "Bolzano",
    provincia: "BZ",
    commercialOwner: "Commerciale",
    technicalOwner: "Tecnico",
    properties: [
      {
        id: "immobile-1",
        comune: "Merano",
        provincia: "BZ",
        address: "Via Roma 10",
        humanReadableAddress: "Via Roma 10" as string | null,
        ubicazione: null,
        foglio: "12",
        particella: "34",
        subalterno: "5",
        categoria: "D/7",
        currentRendita: 1234.567,
        estimatedRendita: 987.654,
        currentImu: 2198.765,
        estimatedImu: 1765.432,
      },
    ],
  };
}

function serviceFixture(options: { humanReadableAddress?: string | null; normalizedAddress?: string } = {}) {
  let capturedSnapshot: PresentationSnapshot | null = null;
  let capturedFileName = "";
  const addressWrites: string[] = [];
  let addressNormalizationCalls = 0;
  const study = studyFixture();
  if ("humanReadableAddress" in options) {
    study.properties[0].humanReadableAddress = options.humanReadableAddress ?? null;
  }
  const prisma = {
    property: {
      update: async ({ data }: { data: { humanReadableAddress: string } }) => {
        addressWrites.push(data.humanReadableAddress);
      },
    },
    presentationDeck: {
      create: async ({ data }: { data: { snapshot: PresentationSnapshot; fileName: string } }) => {
        capturedSnapshot = data.snapshot;
        capturedFileName = data.fileName;
        return {
          id: "deck-1",
          studyId: study.id,
          propertyIds: ["immobile-1"],
          fileName: data.fileName,
          createdAt: new Date("2026-07-24T10:00:00.000Z"),
        };
      },
    },
  };
  const studies = { find: async () => study };
  const addressNormalization = {
    normalize: async () => {
      addressNormalizationCalls++;
      return options.normalizedAddress ?? "Via Roma 10";
    },
  };
  const config = { get: (_key: string, fallback: string) => fallback };
  const service = new PresentationsService(
    prisma as never,
    studies as never,
    addressNormalization as never,
    config as never,
  );
  return {
    service,
    snapshot: () => capturedSnapshot,
    fileName: () => capturedFileName,
    addressWrites,
    addressNormalizationCalls: () => addressNormalizationCalls,
  };
}

test("la generazione precedente con soli propertyIds resta compatibile e arrotonda gli importi ai centesimi", async () => {
  const fixture = serviceFixture();
  await fixture.service.create("studio-1", ["immobile-1"]);

  const snapshot = fixture.snapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.studio.company, "Cliente S.p.A.");
  assert.equal(snapshot.immobili[0].renditaAttuale, 1234.57);
  assert.equal(snapshot.immobili[0].renditaAttribuibile, 987.65);
  assert.equal(snapshot.immobili[0].imuAttuale, 2198.77);
  assert.equal(snapshot.immobili[0].imuOttenibile, 1765.43);
  assert.match(fixture.fileName(), /^proposta-ottimizzazione-/);
});

test("la presentazione v2 usa uno snapshot e un nome file distinti in formato studio di fattibilità", async () => {
  const fixture = serviceFixture();
  const summary = await fixture.service.createV2("studio-1", ["immobile-1"]);

  const snapshot = fixture.snapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.version, 2);
  assert.equal(summary.version, 2);
  assert.match(
    fixture.fileName(),
    /^Studio di fattibilità _ Ottimizzazione rendita catastale _ Cliente S\.p\.A _ \d{2}-\d{2}-\d{4}\.pdf$/,
  );
  assert.equal(summary.htmlDownloadUrl, "/api/presentations/deck-1/html");
});

test("la presentazione v3 usa lo snapshot dinamico ed è disponibile soltanto in PDF", async () => {
  const fixture = serviceFixture();
  const summary = await fixture.service.createV3("studio-1", ["immobile-1"]);

  const snapshot = fixture.snapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.version, 3);
  assert.equal(summary.version, 3);
  assert.match(
    fixture.fileName(),
    /^Studio di fattibilità _ Ottimizzazione rendita catastale _ Cliente S\.p\.A _ \d{2}-\d{2}-\d{4} _ v3\.pdf$/,
  );
  assert.equal(summary.htmlUrl, null);
  assert.equal(summary.htmlDownloadUrl, null);
  assert.equal(summary.pdfUrl, "/api/presentations/deck-1/pdf");
});

test("la generazione PDF normalizza, salva e sostituisce l'indirizzo ERP non modificato", async () => {
  const fixture = serviceFixture({
    humanReadableAddress: null,
    normalizedAddress: "Via delle Industrie 44",
  });
  await fixture.service.createV3(
    "studio-1",
    ["immobile-1"],
    [{
      id: "immobile-1",
      societa: "Cliente S.p.A.",
      comune: "MERANO",
      indirizzo: "Via Roma 10",
      foglioParticellaSub: "Fg. 12 - Part. 34 - Sub. 5",
      categoria: "D/7",
      renditaAttuale: 1234.57,
      renditaAttribuibile: 987.65,
      imuAttuale: 2198.77,
      imuOttenibile: 1765.43,
    }],
  );

  const snapshot = fixture.snapshot();
  assert.ok(snapshot);
  assert.equal(fixture.addressNormalizationCalls(), 1);
  assert.deepEqual(fixture.addressWrites, ["Via delle Industrie 44"]);
  assert.equal(snapshot.immobili[0].indirizzo, "Via delle Industrie 44");
  assert.equal(snapshot.immobili[0].comune, "Merano (BZ)");
});

test("la presentazione v3 di gruppo include tutti gli studi e usa il nome rinominato", async () => {
  const firstStudy = studyFixture();
  const secondStudy = {
    ...studyFixture(),
    id: "studio-2",
    company: "Seconda Società S.r.l.",
    vat: "IT99887766554",
    comune: "Bergamo",
    provincia: "BG",
    properties: [{
      ...studyFixture().properties[0],
      id: "immobile-2",
      comune: "Bergamo",
      provincia: "BG",
      address: "Via delle Industrie 44",
      humanReadableAddress: "Via delle Industrie 44",
    }],
  };
  let deckData: Record<string, any> | null = null;
  const prisma = {
    studyGroup: {
      findUnique: async () => ({
        id: "gruppo-1",
        name: "Portafoglio Logistico Nord",
        studies: [{ id: firstStudy.id }, { id: secondStudy.id }],
      }),
    },
    property: { update: async () => undefined },
    presentationDeck: {
      create: async ({ data }: { data: Record<string, any> }) => {
        deckData = data;
        return {
          ...data,
          id: "deck-gruppo-1",
          studyId: null,
          studyGroupId: "gruppo-1",
          createdAt: new Date("2026-08-28T18:00:00.000Z"),
        };
      },
    },
  };
  const studies = {
    find: async (id: string) => id === firstStudy.id ? firstStudy : id === secondStudy.id ? secondStudy : null,
  };
  const service = new PresentationsService(
    prisma as never,
    studies as never,
    { normalize: async () => "" } as never,
    { get: (_key: string, fallback: string) => fallback } as never,
  );

  const summary = await service.createStudyGroupV3(
    "gruppo-1",
    ["immobile-1", "immobile-2"],
  );

  assert.ok(deckData);
  assert.equal(deckData.studyGroupId, "gruppo-1");
  assert.equal(deckData.studyId, undefined);
  assert.equal(deckData.snapshot.studio.company, "Portafoglio Logistico Nord");
  assert.deepEqual(
    deckData.snapshot.immobili.map((property: { societa: string }) => property.societa),
    ["Cliente S.p.A.", "Seconda Società S.r.l."],
  );
  assert.equal(summary.studyId, null);
  assert.equal(summary.studyGroupId, "gruppo-1");
  assert.match(summary.fileName, /Portafoglio Logistico Nord/);
});

test("il template PDF v3 contiene tutte le sei pagine A4 orizzontali", async () => {
  const templateBytes = await readFile(
    new URL("../../../visual reference/soul_realestate_rendita_catastale_new_template.pdf", import.meta.url),
  );
  const template = await PDFDocument.load(templateBytes);

  assert.equal(template.getPageCount(), 6);
  template.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    assert.ok(Math.abs(width - 841.89) < 0.01);
    assert.ok(Math.abs(height - 595.276) < 0.01);
  });
});

test("la presentazione v2 conserva i testi precedenti con le sole revisioni dei feedback", async () => {
  const template = await readFile(
    new URL("../src/presentations/templates/soul-deck-v2.html", import.meta.url),
    "utf8",
  );

  assert.match(template, /Le più grandi imprese sono formate dalle migliori persone/);
  assert.match(template, /Soul fornisce assistenza per la determinazione o rideterminazione/);
  assert.match(template, /Studio preliminare/);
  assert.match(template, /Le attività di consulenza per le quali sia prevista riserva di legge/);
  assert.match(template, /Rendita catastale attuale/);
  assert.match(template, /Rendita catastale attribuibile/);
  assert.match(template, /Differenza rendita catastale/);
  assert.match(template, /IMU attuale/);
  assert.match(template, /IMU ottenibile/);
  assert.match(template, /Differenza IMU/);
  assert.doesNotMatch(template, /Ottimizzare la rendita catastale significa ricostruire/);
  assert.doesNotMatch(template, /Analisi documentale/);
  assert.doesNotMatch(template, /Risultati dello studio di fattibilità/);
  assert.doesNotMatch(template, /Effetto annuo stimato/);
  assert.doesNotMatch(template, /class="page-index"/);
  assert.doesNotMatch(template, /data-date/);
  assert.match(template, /grid-template-columns: minmax\(0, 39fr\) minmax\(0, 61fr\)/);
  assert.match(template, /tfoot td:not\(:first-child\) \{ text-align: right; \}/);
  assert.match(template, /font-family: "Raleway"/);
  assert.match(template, /font-family: "Roboto"/);
  assert.match(template, /html\.presentation-v3 \.properties-card th:nth-child\(4\)/);
  assert.match(template, /white-space: nowrap; overflow-wrap: normal;/);
  assert.match(template, /html\.presentation-v3 \.properties-card td:nth-child\(n\+6\)/);
  assert.match(template, /html\.presentation-v3 \.economics \.eyebrow \{ color: #006b94; \}/);
  assert.match(template, /html\.presentation-v3 \.economics h2 \{ color: #343534; font-weight: 700; \}/);
  assert.match(template, /if \(data\.version === 3\) document\.documentElement\.classList\.add\("presentation-v3"\)/);
});

test("i campi modificati nell'anteprima vengono congelati nello snapshot della presentazione", async () => {
  const fixture = serviceFixture();
  await fixture.service.create(
    "studio-1",
    ["immobile-1"],
    [
      {
        id: "immobile-1",
        societa: "Società manuale",
        comune: "Comune manuale",
        indirizzo: "Indirizzo manuale",
        foglioParticellaSub: "Fg. 1 - Part. 2 - Sub. 3",
        categoria: "D/8",
        renditaAttuale: 1000.129,
        renditaAttribuibile: 800.555,
        imuAttuale: 200.127,
        imuOttenibile: 150.554,
      },
    ],
    "Cliente personalizzato",
  );

  const snapshot = fixture.snapshot();
  assert.ok(snapshot);
  assert.equal(snapshot.studio.company, "Cliente personalizzato");
  assert.deepEqual(snapshot.immobili[0], {
    id: "immobile-1",
    societa: "Società manuale",
    comune: "Comune manuale (BZ)",
    indirizzo: "Indirizzo manuale",
    foglioParticellaSub: "Fg. 1 - Part. 2 - Sub. 3",
    categoria: "D/8",
    renditaAttuale: 1000.13,
    renditaAttribuibile: 800.56,
    imuAttuale: 200.13,
    imuOttenibile: 150.55,
  });
});

test("non accetta override per immobili esclusi dalla presentazione", async () => {
  const fixture = serviceFixture();
  await assert.rejects(
    fixture.service.create(
      "studio-1",
      ["immobile-1"],
      [
        {
          id: "immobile-estraneo",
          societa: "Società",
          comune: "Comune",
          indirizzo: "Indirizzo",
          foglioParticellaSub: "Fg. 1",
          categoria: "D/7",
          renditaAttuale: 100,
          renditaAttribuibile: 90,
          imuAttuale: 10,
          imuOttenibile: 9,
        },
      ],
    ),
    BadRequestException,
  );
});
