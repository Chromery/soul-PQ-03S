import assert from "node:assert/strict";
import test from "node:test";
import { ErpSyncService } from "../src/erp-sync/erp-sync.service.js";

test("il sync ERP salva subito il fallback e affina l'indirizzo in background", async () => {
  let savedProperty: Record<string, any> | null = null;
  const backgroundUpdates: Array<Record<string, any>> = [];
  let resolveRefinement!: (address: string | null) => void;
  let refinementCalls = 0;
  const refinement = new Promise<string | null>((resolve) => {
    resolveRefinement = resolve;
  });
  const prisma = {
    feasibilityStudy: {
      findUnique: async () => null,
      upsert: async () => undefined,
    },
    studyVersion: { upsert: async () => undefined },
    property: {
      findMany: async () => [],
      upsert: async (input: Record<string, any>) => {
        savedProperty = input;
        return undefined;
      },
      updateMany: async (input: Record<string, any>) => {
        backgroundUpdates.push(input);
        return { count: 1 };
      },
    },
  };
  const service = new ErpSyncService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { assignForStudy: async () => undefined } as never,
    {} as never,
    {
      normalizeInBackground: () => {
        refinementCalls++;
        return refinement;
      },
    } as never,
    { get: (_name: string, fallback: string) => fallback } as never,
  );

  const response = await service.syncStudies({
    studi: [{
      studio_erp_id: "S-ASYNC-1",
      ragione_sociale: "Studio asincrono",
      partita_iva: "IT00000000000",
      immobili: [{
        immobile_erp_id: "I-ASYNC-1",
        ubicazione: "BERGAMO(BG) VIA DELLE INDUSTRIE 44 Piano T",
        comune: "Bergamo",
        provincia: "BG",
        categoria: "D/1",
        documenti: [],
      }],
    }],
  });

  assert.equal(response.stato, "completato");
  assert.equal(refinementCalls, 1);
  assert.equal((savedProperty as Record<string, any> | null)?.create.humanReadableAddress, "Via delle Industrie 44");
  assert.equal(backgroundUpdates.length, 0);

  resolveRefinement("Via delle Industrie 44/A");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(backgroundUpdates, [{
    where: {
      id: "I-ASYNC-1",
      humanReadableAddress: "Via delle Industrie 44",
    },
    data: { humanReadableAddress: "Via delle Industrie 44/A" },
  }]);
});
