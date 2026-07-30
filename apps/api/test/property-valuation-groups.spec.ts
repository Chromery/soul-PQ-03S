import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
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
  const prisma = {
    propertyValuationGroup: {
      findFirst: async () => ({ id: "GRUPPO-1" }),
    },
    $transaction: async (operation: (tx: Record<string, any>) => Promise<void>) => operation({
      property: {
        updateMany: async () => {
          writes.push("properties-unlinked");
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

  assert.deepEqual(writes, ["properties-unlinked", "group-deleted"]);
});
