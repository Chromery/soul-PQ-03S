import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
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
        address: "Via Roma 10",
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

function serviceFixture() {
  let capturedSnapshot: PresentationSnapshot | null = null;
  let capturedFileName = "";
  const study = studyFixture();
  const prisma = {
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
  const config = { get: (_key: string, fallback: string) => fallback };
  const service = new PresentationsService(prisma as never, studies as never, config as never);
  return {
    service,
    snapshot: () => capturedSnapshot,
    fileName: () => capturedFileName,
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
    comune: "Comune manuale",
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
