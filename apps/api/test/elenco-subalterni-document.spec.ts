import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { DocumentType } from "../src/generated/prisma/enums.js";
import { ErpSyncService } from "../src/erp-sync/erp-sync.service.js";
import { PropertiesService } from "../src/properties/properties.service.js";

const MOCK_PDF_BASE64 = "JVBERi0xLjQKJUVPRgo=";

test("il sync ERP salva l'elenco subalterni sullo stesso endpoint senza avviare estrazioni AI", async () => {
  const documentUpserts: Array<Record<string, any>> = [];
  const storageWrites: Array<Record<string, any>> = [];
  let scaleExtractions = 0;
  let visuraExtractions = 0;
  const prisma = {
    feasibilityStudy: {
      findUnique: async () => null,
      upsert: async () => undefined,
    },
    studyVersion: { upsert: async () => undefined },
    property: { upsert: async () => undefined },
    propertyDocument: {
      findUnique: async () => null,
      upsert: async (input: Record<string, any>) => {
        documentUpserts.push(input);
        return { id: "DOC-SUB-1" };
      },
    },
  };
  const service = new ErpSyncService(
    prisma as never,
    {
      storeBase64Pdf: async (input: Record<string, any>) => {
        storageWrites.push(input);
        return {
          storageKey: "erp/S-1/I-1/elenco_subalterni/elenco.pdf",
          sha256: "a".repeat(64),
          sizeBytes: 12,
        };
      },
    } as never,
    { enqueueDocumentPdf: async () => { scaleExtractions++; } } as never,
    { enqueueDocumentPdf: async () => { visuraExtractions++; } } as never,
    { assignForStudy: async () => undefined } as never,
    {} as never,
    { get: (_name: string, fallback: string) => fallback } as never,
  );

  const response = await service.syncStudies({
    sync_id_erp: "SYNC-SUB-1",
    studi: [{
      studio_erp_id: "S-1",
      ragione_sociale: "Studio test",
      partita_iva: "IT00000000000",
      immobili: [{
        immobile_erp_id: "I-1",
        ubicazione: "MILANO(MI) VIA TEST 1",
        comune: "Milano",
        provincia: "MI",
        foglio: "1",
        particella: "2",
        categoria: "D/1",
        documenti: [{
          tipo: "elenco_subalterni",
          documento_erp_id: "ERP-DOC-SUB-1",
          file_nome: "elenco-subalterni.pdf",
          mime_type: "application/pdf",
          file_base64: MOCK_PDF_BASE64,
        }],
      }],
    }],
  });

  assert.equal(documentUpserts[0]?.create.type, DocumentType.ELENCO_SUBALTERNI);
  assert.equal(documentUpserts[0]?.create.erpDocumentId, "ERP-DOC-SUB-1");
  assert.equal(storageWrites[0]?.tipo, "elenco_subalterni");
  assert.equal(scaleExtractions, 0);
  assert.equal(visuraExtractions, 0);
  assert.equal(response.risultati[0]?.documenti_salvati, 1);
});

test("upload, apertura ed eliminazione manuale dell'elenco subalterni usano un solo record per immobile", async () => {
  let savedDocument: Record<string, any> | null = null;
  const deletedStorageKeys: string[] = [];
  const prisma = {
    property: {
      findUnique: async () => ({ id: "I-1", studyId: "S-1" }),
    },
    propertyDocument: {
      upsert: async (input: Record<string, any>) => {
        savedDocument = {
          id: "DOC-SUB-1",
          ...input.create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return savedDocument;
      },
      findUnique: async () => savedDocument,
      delete: async () => {
        savedDocument = null;
      },
    },
  };
  const storage = {
    storeBase64Pdf: async (input: { fileNome: string }) => ({
      storageKey: `erp/S-1/I-1/elenco_subalterni/${input.fileNome}`,
      sha256: "b".repeat(64),
      sizeBytes: 14,
    }),
    readPdfObject: async () => ({
      stream: Readable.from(Buffer.from("%PDF-1.4\n%%EOF")),
      contentType: "application/pdf",
      contentLength: 14,
    }),
    deleteObject: async (storageKey: string) => {
      deletedStorageKeys.push(storageKey);
    },
  };
  const service = new PropertiesService(
    prisma as never,
    storage as never,
    {} as never,
    { enqueueDocumentPdf: async () => undefined } as never,
  );

  const firstUpload = await service.uploadDocument("I-1", "elenco_subalterni", {
    file_name: "elenco-subalterni.pdf",
    file_base64: MOCK_PDF_BASE64,
    mime_type: "application/pdf",
  });
  const uploaded = await service.uploadDocument("I-1", "elenco_subalterni", {
    file_name: "elenco-subalterni-aggiornato.pdf",
    file_base64: MOCK_PDF_BASE64,
    mime_type: "application/pdf",
  });
  const opened = await service.openDocument("I-1", "elenco_subalterni");
  const deleted = await service.deleteDocument("I-1", "elenco_subalterni");

  assert.equal(uploaded.type, "elenco_subalterni");
  assert.equal(uploaded.id, firstUpload.id);
  assert.equal(uploaded.downloadUrl, "/api/properties/I-1/documents/elenco_subalterni/download");
  assert.equal(opened.fileName, "elenco-subalterni-aggiornato.pdf");
  assert.equal(opened.contentType, "application/pdf");
  assert.deepEqual(deletedStorageKeys, [
    "erp/S-1/I-1/elenco_subalterni/elenco-subalterni.pdf",
    "erp/S-1/I-1/elenco_subalterni/elenco-subalterni-aggiornato.pdf",
  ]);
  assert.equal(deleted.deleted, true);
  assert.equal(savedDocument, null);
});
