import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  StudiesService,
  validateStudyGroupSelection,
} from "../src/studies/studies.service.js";

test("un gruppo richiede almeno due studi distinti", () => {
  assert.throws(
    () => validateStudyGroupSelection(["STUDIO-1", "STUDIO-1"]),
    BadRequestException,
  );
  assert.deepEqual(
    validateStudyGroupSelection([" STUDIO-1 ", "STUDIO-2", "STUDIO-2"]),
    ["STUDIO-1", "STUDIO-2"],
  );
});

test("raggruppa studi esistenti non ancora raggruppati", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const prisma = {
    feasibilityStudy: {
      findMany: async () => [
        { id: "STUDIO-1", studyGroupId: null, company: "Alfa S.p.A." },
        { id: "STUDIO-2", studyGroupId: null, company: "Beta S.r.l." },
      ],
    },
    $transaction: async (operation: (tx: Record<string, any>) => Promise<void>) => operation({
      studyGroup: {
        create: async (input: Record<string, unknown>) => {
          writes.push(input);
          return { id: "GRUPPO-1" };
        },
      },
      feasibilityStudy: {
        updateMany: async (input: Record<string, unknown>) => {
          writes.push(input);
        },
      },
    }),
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);
  service.list = async () => [{ id: "STUDIO-1", studyGroupId: "GRUPPO-1" }] as never;

  const result = await service.groupStudies(["STUDIO-1", "STUDIO-2"]);

  assert.equal(result[0]?.studyGroupId, "GRUPPO-1");
  assert.deepEqual(writes[0], { data: { name: "Gruppo Alfa S.p.A. + Beta S.r.l." } });
  assert.deepEqual(writes[1], {
    where: { id: { in: ["STUDIO-1", "STUDIO-2"] } },
    data: { studyGroupId: "GRUPPO-1" },
  });
});

test("rinomina un gruppo e restituisce gli studi aggiornati", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const prisma = {
    studyGroup: {
      findUnique: async () => ({ id: "GRUPPO-1" }),
      update: async (input: Record<string, unknown>) => writes.push(input),
    },
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);
  service.list = async () => [{ id: "STUDIO-1", studyGroupName: "Portafoglio Nord" }] as never;

  const result = await service.updateStudyGroup("GRUPPO-1", " Portafoglio Nord ");

  assert.equal(result?.[0]?.studyGroupName, "Portafoglio Nord");
  assert.deepEqual(writes, [{ where: { id: "GRUPPO-1" }, data: { name: "Portafoglio Nord" } }]);
});

test("rifiuta studi gia presenti in un altro gruppo", async () => {
  const prisma = {
    feasibilityStudy: {
      findMany: async () => [
        { id: "STUDIO-1", studyGroupId: "GRUPPO-ESISTENTE" },
        { id: "STUDIO-2", studyGroupId: null },
      ],
    },
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);

  await assert.rejects(
    () => service.groupStudies(["STUDIO-1", "STUDIO-2"]),
    BadRequestException,
  );
});

test("scioglie il gruppo senza eliminare gli studi", async () => {
  const writes: string[] = [];
  const prisma = {
    studyGroup: {
      findUnique: async () => ({
        id: "GRUPPO-1",
        studies: [{ id: "STUDIO-1" }, { id: "STUDIO-2" }],
        analysisDraft: null,
      }),
    },
    $transaction: async (operation: (tx: Record<string, any>) => Promise<void>) => operation({
      feasibilityStudy: {
        updateMany: async () => {
          writes.push("studies-unlinked");
        },
      },
      studyGroup: {
        delete: async () => {
          writes.push("group-deleted");
        },
      },
    }),
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);
  service.list = async () => [];
  (service as any).refreshStudyTotals = async (studyId: string) => {
    writes.push(`totals-${studyId}`);
  };

  const result = await service.ungroupStudies("GRUPPO-1");

  assert.deepEqual(result, []);
  assert.deepEqual(writes, [
    "studies-unlinked",
    "group-deleted",
    "totals-STUDIO-1",
    "totals-STUDIO-2",
  ]);
});
