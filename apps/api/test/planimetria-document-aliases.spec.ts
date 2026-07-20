import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { DocumentType } from "../src/generated/prisma/enums.js";
import { ErpSyncService } from "../src/erp-sync/erp-sync.service.js";
import { PropertiesService } from "../src/properties/properties.service.js";
import { StudiesService } from "../src/studies/studies.service.js";

for (const alias of ["planimetria", "elaborato", "elaborato_planimetrico"]) {
  test(`il sync normalizza ${alias} come PLANIMETRIA e avvia l'estrazione della scala`, async () => {
    const documentUpserts: Array<Record<string, any>> = [];
    const propertyUpserts: Array<Record<string, any>> = [];
    const extractionJobs: Array<Record<string, any>> = [];
    const storageWrites: Array<Record<string, any>> = [];
    const prisma = {
      feasibilityStudy: {
        findUnique: async () => null,
        upsert: async () => undefined,
      },
      studyVersion: { upsert: async () => undefined },
      property: {
        upsert: async (input: Record<string, any>) => {
          propertyUpserts.push(input);
          return undefined;
        },
      },
      propertyDocument: {
        findUnique: async () => null,
        upsert: async (input: Record<string, any>) => {
          documentUpserts.push(input);
          return { id: "DOC-1" };
        },
      },
    };
    const storage = {
      storeBase64Pdf: async (input: Record<string, any>) => {
        storageWrites.push(input);
        return {
          storageKey: "erp/S-1/I-1/planimetria/test-planimetria.pdf",
          sha256: "a".repeat(64),
          sizeBytes: 12,
        };
      },
    };
    const scaleExtraction = {
      enqueueDocumentPdf: async (input: Record<string, any>) => {
        extractionJobs.push(input);
      },
    };
    const service = new ErpSyncService(
      prisma as never,
      storage as never,
      scaleExtraction as never,
      { enqueueDocumentPdf: async () => undefined } as never,
      { assignForStudy: async () => undefined } as never,
      {} as never,
      { get: (_name: string, fallback: string) => fallback } as never,
    );

    const response = await service.syncStudies({
      studi: [
        {
          studio_erp_id: "S-1",
          ragione_sociale: "Studio test",
          partita_iva: "IT00000000000",
          immobili: [
            {
              immobile_erp_id: "I-1",
              ubicazione: "Via Test 1",
              comune: "Monza",
              provincia: "MB",
              foglio: "1",
              particella: "2",
              categoria: "D/1",
              in_studio: true,
              documenti: [
                {
                  tipo: alias,
                  file_nome: "test-planimetria.pdf",
                  mime_type: "application/pdf",
                  file_base64: "JVBERi0xLjQKJUVPRgo=",
                },
              ],
            },
          ],
        },
      ],
    });

    assert.equal(documentUpserts.length, 1);
    assert.equal(propertyUpserts[0]?.create.provincia, "MI");
    assert.equal(propertyUpserts[0]?.create.comune, "MONZA");
    assert.equal(documentUpserts[0]?.create.type, DocumentType.PLANIMETRIA);
    assert.equal(storageWrites[0]?.tipo, "planimetria");
    assert.equal(extractionJobs.length, 1);
    assert.equal(response.risultati[0]?.documenti_salvati, 1);
  });
}

test("il sync ricava la provincia dalla ubicazione catastale quando il campo ERP è assente", () => {
  const service = new ErpSyncService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: (_name: string, fallback: string) => fallback } as never,
  );
  const property = (service as unknown as {
    normalizeProperty: (input: Record<string, unknown>, index: number) => {
      comune: string;
      provincia: string;
    };
  }).normalizeProperty({
    immobile_erp_id: "1555370",
    ubicazione: "BARI(BA) STRADA BARI-MODUGNO-TORITTO n. 10 Piano S1-T",
    comune: "BARI",
    foglio: "36",
    particella: "127",
    categoria: "D/7",
    documenti: [],
  }, 0);

  assert.equal(property.comune, "BARI");
  assert.equal(property.provincia, "BA");
});

test("il download planimetria usa un record ELABORATO_PLANIMETRICO legacy", async () => {
  const requestedTypes: DocumentType[] = [];
  const legacyDocument = {
    id: "DOC-LEGACY",
    propertyId: "I-1",
    type: DocumentType.ELABORATO_PLANIMETRICO,
    fileName: "elaborato.pdf",
    storageKey: "erp/S-1/I-1/elaborato/elaborato.pdf",
    mimeType: "application/pdf",
    sha256: null,
    sizeBytes: 7,
  };
  const prisma = {
    property: { findUnique: async () => ({ id: "I-1", studyId: "S-1" }) },
    propertyDocument: {
      findUnique: async (input: { where: { propertyId_type: { type: DocumentType } } }) => {
        const type = input.where.propertyId_type.type;
        requestedTypes.push(type);
        return type === DocumentType.ELABORATO_PLANIMETRICO ? legacyDocument : null;
      },
    },
  };
  const service = new PropertiesService(
    prisma as never,
    {
      readPdfObject: async () => ({
        stream: Readable.from(Buffer.from("%PDF-1.4")),
        contentType: "application/pdf",
        contentLength: 8,
      }),
    } as never,
    {} as never,
  );

  const opened = await service.openDocument("I-1", "planimetria");

  assert.deepEqual(requestedTypes, [DocumentType.PLANIMETRIA, DocumentType.ELABORATO_PLANIMETRICO]);
  assert.equal(opened.fileName, "elaborato.pdf");
  assert.equal(opened.contentType, "application/pdf");
});

test("la risposta studio espone un record elaborato legacy come planimetria", async () => {
  const now = new Date("2026-07-15T10:00:00.000Z");
  const legacyDocument = {
    id: "DOC-LEGACY",
    propertyId: "I-1",
    type: DocumentType.ELABORATO_PLANIMETRICO,
    fileName: "elaborato.pdf",
    storageKey: "erp/S-1/I-1/elaborato/elaborato.pdf",
    mimeType: "application/pdf",
    sha256: null,
    sizeBytes: 7,
    createdAt: now,
    updatedAt: now,
  };
  const property = {
    id: "I-1",
    studyId: "S-1",
    address: "Via Test 1",
    comune: "Milano",
    provincia: "MI",
    ubicazione: "Via Test 1",
    foglio: "1",
    particella: "2",
    subalterno: "3",
    categoria: "D/1",
    titolarita: null,
    currentRendita: 1000,
    estimatedRendita: 0,
    diffPercent: 0,
    currentImu: 0,
    estimatedImu: 0,
    imuDiff: 0,
    displayOrder: 0,
    outcome: "Neutro",
    hasStudy: true,
    sheetSize: null,
    scaleDenominator: null,
    scaleSource: null,
    aiScaleDenominator: null,
    aiScaleLabel: null,
    aiSheetSize: null,
    aiScaleConfidence: null,
    aiScaleDetectedAt: null,
    createdAt: now,
    updatedAt: now,
    documents: [legacyDocument],
    analysisDraft: null,
    priceLists: [],
  };
  const study = {
    id: "S-1",
    companyErpId: null,
    company: "Studio test",
    vat: "IT00000000000",
    comune: "Milano",
    provincia: "MI",
    region: "Lombardia",
    status: "In lavorazione",
    createdAt: now,
    concludedAt: null,
    deadline: now,
    nextAppointment: null,
    diffRendita: 0,
    diffImu: 0,
    originalRendita: 0,
    totalRendita: 0,
    catDRendita: 0,
    commercialOwner: "Commerciale",
    technicalOwner: "Tecnico",
    notes: "",
    erpUrl: null,
    erpImportedAt: null,
    erpUpdatedAt: null,
    sourceSyncId: null,
    importedAt: now,
    updatedAt: now,
    properties: [property],
    versions: [],
  };
  const service = new StudiesService(
    { feasibilityStudy: { findUnique: async () => study } } as never,
    {} as never,
    {
      calculate: ({ rendita }: { rendita: number }) => ({
        status: "calculated",
        amount: rendita * 0.2,
        taxableBase: rendita * 20,
        cadastralMultiplier: 20,
        ratePercent: 1,
        rateYear: 2025,
        usedFallback: true,
        rateKind: "group_d",
        municipality: "MILANO",
        province: "MI",
        cadastralCode: "F205",
        actNumber: "1",
        actDate: "01/01/2025",
        publicationDate: "01/01/2025",
        sourcePath: "delibera.pdf",
        sourceUrl: "/api/imu/delibere/test",
      }),
    } as never,
  );

  const response = await service.find("S-1");
  const apiProperty = response?.properties[0];

  assert.equal(apiProperty?.documents.planimetria, "elaborato.pdf");
  assert.equal(apiProperty?.documentUrls.planimetria, "/api/properties/I-1/documents/planimetria/download");
  assert.equal(apiProperty?.formapsProvincia, "MI");
  assert.equal(apiProperty?.formapsComune, "MILANO");
  assert.equal(apiProperty?.currentImu, 200);
  assert.equal(apiProperty?.currentImuSource, "calculated");
  assert.equal(apiProperty?.currentImuCalculation?.status, "calculated");
});
