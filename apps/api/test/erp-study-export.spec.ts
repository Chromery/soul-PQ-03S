import assert from "node:assert/strict";
import test from "node:test";
import { ErpSyncService } from "../src/erp-sync/erp-sync.service.js";

const dayBefore = new Date("2026-08-31T10:00:00.000Z");
const presentationCreatedAt = new Date("2026-09-02T09:30:00.000Z");

function propertyFixture() {
  return {
    id: "IMM-1",
    studyId: "STUDIO-1",
    valuationGroupId: null,
    address: "MILANO(MI) VIA TEST 1",
    humanReadableAddress: "Via Test 1",
    notes: "Nota specifica dell'immobile",
    comune: "Milano",
    provincia: "MI",
    ubicazione: "MILANO(MI) VIA TEST 1",
    foglio: "1",
    particella: "2",
    subalterno: "3",
    sezioneCatastale: null,
    codiceComuneCatastale: "F205",
    formapsMunicipalityId: null,
    categoria: "D/1",
    titolarita: "Proprietario",
    oneri: false,
    currentRendita: 1000,
    estimatedRendita: 800,
    diffPercent: -20,
    currentImu: 200,
    estimatedImu: 160,
    imuDiff: -40,
    imuRateOverride: null,
    imuMultiplierOverride: null,
    displayOrder: 0,
    outcome: "Positivo",
    hasStudy: true,
    sheetSize: "A3",
    scaleDenominator: 200,
    scaleSource: "AI",
    aiScaleDenominator: 200,
    aiScaleLabel: "1:200",
    aiSheetSize: "A3",
    aiScaleConfidence: 0.99,
    aiScaleDetectedAt: dayBefore,
    createdAt: dayBefore,
    updatedAt: dayBefore,
    documents: [],
    analysisDraft: null,
    valuationGroup: null,
  };
}

function studyFixture(withPresentation: boolean) {
  const groupPresentation = {
    id: "PRESENTAZIONE-V3-GRUPPO",
    studyId: null,
    studyGroupId: "GRUPPO-1",
    propertyIds: ["IMM-1"],
    fileName: "presentazione-v3.pdf",
    createdAt: presentationCreatedAt,
  };
  return {
    id: "STUDIO-1",
    studyGroupId: "GRUPPO-1",
    companyErpId: "AZIENDA-1",
    company: "Azienda Srl",
    vat: "IT00000000000",
    comune: "Milano",
    provincia: "MI",
    region: "Lombardia",
    status: "Concluso",
    createdAt: dayBefore,
    concludedAt: dayBefore,
    deadline: dayBefore,
    nextAppointment: null,
    diffRendita: -200,
    diffImu: -40,
    originalRendita: 1000,
    totalRendita: 800,
    catDRendita: 1000,
    commercialOwner: "Commerciale",
    technicalOwner: "Tecnico",
    notes: "Nota studio",
    erpUrl: null,
    erpImportedAt: dayBefore,
    erpUpdatedAt: dayBefore,
    sourceSyncId: null,
    importedAt: dayBefore,
    updatedAt: dayBefore,
    properties: [propertyFixture()],
    versions: [],
    presentations: [],
    studyGroup: {
      analysisDraft: null,
      presentations: withPresentation ? [groupPresentation] : [],
    },
  };
}

function serviceFixture(withPresentation: boolean) {
  let findManyInput: Record<string, any> | null = null;
  const service = new ErpSyncService(
    {
      feasibilityStudy: {
        findMany: async (input: Record<string, any>) => {
          findManyInput = input;
          return [studyFixture(withPresentation)];
        },
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      calculate: ({ rendita }: { rendita: number }) => ({ status: "calculated", amount: rendita * 0.2 }),
    } as never,
    {} as never,
    { get: (_name: string, fallback: string) => fallback } as never,
  );
  return { service, findManyInput: () => findManyInput };
}

test("il pull ERP include note immobile e l'ultima presentazione v3 manuale di gruppo", async () => {
  const fixture = serviceFixture(true);
  const response = await fixture.service.listModifiedStudies("2026-09-01T00:00:00.000Z");

  assert.equal(response.totale, 1);
  assert.equal(response.studi[0]?.immobili[0]?.note_immobile, "Nota specifica dell'immobile");
  assert.deepEqual(response.studi[0]?.presentazione, {
    presentazione_id: "PRESENTAZIONE-V3-GRUPPO",
    versione: 3,
    ambito: "gruppo_studi",
    gruppo_studi_id: "GRUPPO-1",
    immobili_erp_ids: ["IMM-1"],
    file_nome: "presentazione-v3.pdf",
    mime_type: "application/pdf",
    creata_il: presentationCreatedAt.toISOString(),
    download_url: "/api/integrations/erp/v1/presentazioni/PRESENTAZIONE-V3-GRUPPO/pdf",
  });
  assert.equal(response.studi[0]?.modificato_il, presentationCreatedAt.toISOString());
  assert.deepEqual(
    fixture.findManyInput()?.include.presentations.where.snapshot,
    { path: ["version"], equals: 3 },
  );
});

test("il pull ERP omette la presentazione quando non esiste una v3 manuale", async () => {
  const fixture = serviceFixture(false);
  const response = await fixture.service.listModifiedStudies();

  assert.equal(response.totale, 1);
  assert.equal(Object.hasOwn(response.studi[0] ?? {}, "presentazione"), false);
});
