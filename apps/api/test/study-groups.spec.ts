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
        { id: "STUDIO-1", studyGroupId: null },
        { id: "STUDIO-2", studyGroupId: null },
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
  assert.deepEqual(writes[0], { data: {} });
  assert.deepEqual(writes[1], {
    where: { id: { in: ["STUDIO-1", "STUDIO-2"] } },
    data: { studyGroupId: "GRUPPO-1" },
  });
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
      findUnique: async () => ({ id: "GRUPPO-1" }),
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

  const result = await service.ungroupStudies("GRUPPO-1");

  assert.deepEqual(result, []);
  assert.deepEqual(writes, ["studies-unlinked", "group-deleted"]);
});
