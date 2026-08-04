import assert from "node:assert/strict";
import test from "node:test";
import { StudiesService } from "../src/studies/studies.service.js";

test("l'API conserva l'ordine manuale degli immobili", async () => {
  let query: Record<string, any> | null = null;
  const prisma = {
    feasibilityStudy: {
      findMany: async (input: Record<string, any>) => {
        query = input;
        return [];
      },
    },
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);

  await service.list();

  assert.deepEqual(query?.include.properties.orderBy, [
    { displayOrder: "asc" },
    { id: "asc" },
  ]);
});

test("salva il trascinamento nello stesso ordine mostrato dall'interfaccia", async () => {
  const writes: Array<{ id: string; displayOrder: number }> = [];
  const prisma = {
    feasibilityStudy: {
      findUnique: async () => ({
        properties: [{ id: "IMM-1" }, { id: "IMM-2" }, { id: "IMM-3" }],
      }),
    },
    property: {
      update: async (input: Record<string, any>) => {
        writes.push({ id: input.where.id, displayOrder: input.data.displayOrder });
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);
  service.find = async () => ({ id: "STUDIO-1" }) as never;

  await service.reorderProperties("STUDIO-1", ["IMM-3", "IMM-1", "IMM-2"]);

  assert.deepEqual(writes, [
    { id: "IMM-3", displayOrder: 0 },
    { id: "IMM-1", displayOrder: 1 },
    { id: "IMM-2", displayOrder: 2 },
  ]);
});
