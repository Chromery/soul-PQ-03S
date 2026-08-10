import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import { Readable } from "node:stream";
import { PropertiesService, allocateGroupRendita } from "../src/properties/properties.service.js";
import {
  StudiesService,
  validatePropertyValuationGroupSelection,
} from "../src/studies/studies.service.js";

test("la valutazione complessiva richiede almeno due immobili distinti", () => {
  assert.throws(
    () => validatePropertyValuationGroupSelection(["IMM-1", "IMM-1"]),
    BadRequestException,
  );
  assert.deepEqual(
    validatePropertyValuationGroupSelection([" IMM-1 ", "IMM-2", "IMM-2"]),
    ["IMM-1", "IMM-2"],
  );
});

test("ripartisce la rendita complessiva in proporzione alle rendite attuali senza perdere centesimi", () => {
  const allocations = allocateGroupRendita(1000.01, [
    { id: "SUB-702", currentRendita: 300 },
    { id: "SUB-703", currentRendita: 700 },
  ]);

  assert.equal(allocations.get("SUB-702"), 300);
  assert.equal(allocations.get("SUB-703"), 700.01);
  assert.equal(Array.from(allocations.values()).reduce((sum, value) => sum + value, 0), 1000.01);
});

test("combina gli elaborati delle unita in un unico PDF multipagina", async () => {
  async function onePagePdf() {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 200]);
    return Buffer.from(await pdf.save());
  }
  const firstPdf = await onePagePdf();
  const secondPdf = await onePagePdf();
  const prisma = {
    propertyValuationGroup: {
      findUnique: async () => ({
        id: "GRUPPO-1",
        studyId: "STUDIO-1",
        properties: [
          {
            id: "IMM-1",
            displayOrder: 0,
            documents: [{ type: "PLANIMETRIA", storageKey: "erp/imm-1.pdf" }],
          },
          {
            id: "IMM-2",
            displayOrder: 1,
            documents: [{ type: "PLANIMETRIA", storageKey: "erp/imm-2.pdf" }],
          },
        ],
      }),
    },
  };
  const storage = {
    readPdfObject: async (key: string) => ({
      stream: Readable.from(key.includes("imm-1") ? firstPdf : secondPdf),
    }),
  };
  const service = new PropertiesService(prisma as never, storage as never, {} as never, {} as never);

  const combined = await service.openValuationGroupPlan("GRUPPO-1");
  const loaded = await PDFDocument.load(combined.buffer);

  assert.equal(loaded.getPageCount(), 2);
  assert.deepEqual(combined.includedPropertyIds, ["IMM-1", "IMM-2"]);
  assert.deepEqual(combined.missingPropertyIds, []);
});

test("combina in un solo PDF gli immobili appartenenti a studi diversi dello stesso gruppo", async () => {
  async function onePagePdf() {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 200]);
    return Buffer.from(await pdf.save());
  }
  const firstPdf = await onePagePdf();
  const secondPdf = await onePagePdf();
  const prisma = {
    studyGroup: {
      findUnique: async () => ({
        id: "GRUPPO-STUDI-1",
        studies: [
          {
            id: "STUDIO-1",
            createdAt: new Date("2026-01-01"),
            properties: [{
              id: "IMM-1",
              displayOrder: 0,
              documents: [{ type: "PLANIMETRIA", storageKey: "erp/studio-1.pdf" }],
            }],
          },
          {
            id: "STUDIO-2",
            createdAt: new Date("2026-01-02"),
            properties: [{
              id: "IMM-2",
              displayOrder: 0,
              documents: [{ type: "PLANIMETRIA", storageKey: "erp/studio-2.pdf" }],
            }],
          },
        ],
      }),
    },
  };
  const storage = {
    readPdfObject: async (key: string) => ({
      stream: Readable.from(key.includes("studio-1") ? firstPdf : secondPdf),
    }),
  };
  const service = new PropertiesService(prisma as never, storage as never, {} as never, {} as never);

  const combined = await service.openStudyGroupPlan("GRUPPO-STUDI-1");
  const loaded = await PDFDocument.load(combined.buffer);

  assert.equal(loaded.getPageCount(), 2);
  assert.deepEqual(combined.includedPropertyIds, ["IMM-1", "IMM-2"]);
  assert.deepEqual(combined.missingPropertyIds, []);
});

test("raggruppa soltanto immobili dello studio non gia raggruppati", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const prisma = {
    feasibilityStudy: {
      findUnique: async () => ({
        id: "STUDIO-1",
        properties: [
          { id: "IMM-1", valuationGroupId: null },
          { id: "IMM-2", valuationGroupId: null },
        ],
      }),
    },
    $transaction: async (operation: (tx: Record<string, any>) => Promise<void>) => operation({
      propertyValuationGroup: {
        create: async (input: Record<string, unknown>) => {
          writes.push(input);
          return { id: "GRUPPO-1" };
        },
      },
      property: {
        updateMany: async (input: Record<string, unknown>) => {
          writes.push(input);
        },
      },
    }),
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);
  service.find = async () => ({ id: "STUDIO-1" }) as never;

  const result = await service.groupProperties("STUDIO-1", ["IMM-1", "IMM-2"]);

  assert.equal(result?.id, "STUDIO-1");
  assert.deepEqual(writes[0], { data: { studyId: "STUDIO-1" } });
  assert.deepEqual(writes[1], {
    where: { studyId: "STUDIO-1", id: { in: ["IMM-1", "IMM-2"] } },
    data: { valuationGroupId: "GRUPPO-1" },
  });
});

test("rifiuta di inserire in un nuovo gruppo un immobile gia raggruppato", async () => {
  const prisma = {
    feasibilityStudy: {
      findUnique: async () => ({
        id: "STUDIO-1",
        properties: [
          { id: "IMM-1", valuationGroupId: "GRUPPO-ESISTENTE" },
          { id: "IMM-2", valuationGroupId: null },
        ],
      }),
    },
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);

  await assert.rejects(
    () => service.groupProperties("STUDIO-1", ["IMM-1", "IMM-2"]),
    BadRequestException,
  );
});

test("lo scioglimento conserva gli immobili e rimuove soltanto il gruppo", async () => {
  const writes: string[] = [];
  const propertyUpdates: Array<Record<string, unknown>> = [];
  const prisma = {
    property: {
      findMany: async () => [],
    },
    feasibilityStudy: {
      update: async () => {
        writes.push("study-totals-refreshed");
      },
    },
    propertyValuationGroup: {
      findFirst: async () => ({
        id: "GRUPPO-1",
        analysisDraft: {
          payload: {
            previousPropertyValues: [{
              id: "IMM-1",
              estimatedRendita: 810,
              diffPercent: -19,
              estimatedImu: 120,
              imuDiff: -30,
              hasStudy: true,
            }],
          },
        },
      }),
    },
    $transaction: async (operation: (tx: Record<string, any>) => Promise<void>) => operation({
      property: {
        updateMany: async (input: Record<string, unknown>) => {
          propertyUpdates.push(input);
          writes.push(propertyUpdates.length === 1 ? "properties-unlinked" : "property-restored");
        },
      },
      propertyValuationGroup: {
        delete: async () => {
          writes.push("group-deleted");
        },
      },
    }),
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);
  service.find = async () => ({ id: "STUDIO-1" }) as never;

  await service.ungroupProperties("STUDIO-1", "GRUPPO-1");

  assert.deepEqual(writes, [
    "properties-unlinked",
    "property-restored",
    "group-deleted",
    "study-totals-refreshed",
  ]);
  assert.deepEqual(propertyUpdates[1], {
    where: { id: "IMM-1", studyId: "STUDIO-1" },
    data: {
      estimatedRendita: 810,
      diffPercent: -19,
      estimatedImu: 120,
      imuDiff: -30,
      hasStudy: true,
    },
  });
});
