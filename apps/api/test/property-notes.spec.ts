import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PropertiesService } from "../src/properties/properties.service.js";
import { StudiesService } from "../src/studies/studies.service.js";

test("lista e dettaglio studio restituiscono Sospeso senza convertirlo in Neutro", async () => {
  const study = { id: "STUDIO-1", status: "Aperta", versions: [], properties: [
    { id: "IMM-1", outcome: "Sospeso", comune: "Milano", provincia: "MI", categoria: "D/7",
      documents: [], priceLists: [], analysisDraft: null, currentRendita: 1000, estimatedRendita: 800,
      currentImu: null, estimatedImu: null, notes: "Nota conservata", hasStudy: true },
  ] };
  const service = new StudiesService({ feasibilityStudy: {
    findMany: async () => [study], findUnique: async () => study,
  } } as never, {} as never, { calculate: () => ({ status: "unavailable" }) } as never);
  for (const outcome of ["Sospeso", "sospeso", "SOSPESO"]) {
    study.properties[0].outcome = outcome;
    assert.equal((await service.list())[0].properties[0].outcome, "Sospeso");
    assert.equal((await service.find(study.id))?.properties[0].outcome, "Sospeso");
  }
});

test("salva Sospeso e gli altri esiti senza modificare note o valori economici", async () => {
  const writes: unknown[] = [];
  const existing = { id: "IMM-1", outcome: "Neutro", notes: "Nota conservata", oneri: false,
    imuRateOverride: null, imuMultiplierOverride: null, analysisDraft: null };
  const service = new PropertiesService({ property: {
    findUnique: async () => existing,
    update: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return { ...existing, ...data }; },
  } } as never, {} as never, {} as never, {} as never);
  for (const outcome of ["Sospeso", "Positivo", "Negativo", "Neutro"]) {
    const result = await service.updateProperty("IMM-1", { outcome });
    assert.equal(result.outcome, outcome);
    assert.equal(result.notes, existing.notes);
    assert.deepEqual(writes.at(-1), { outcome });
  }
  await assert.rejects(() => service.updateProperty("IMM-1", { outcome: "Sospesa" }), BadRequestException);
  assert.equal(writes.length, 4);
});

test("salva note specifiche per il singolo immobile", async () => {
  const existing = {
    id: "IMM-1",
    studyId: "STUDIO-1",
    outcome: "Neutro",
    oneri: false,
    notes: "",
    imuRateOverride: null,
    imuMultiplierOverride: null,
    analysisDraft: null,
  };
  const writes: Array<Record<string, unknown>> = [];
  const prisma = {
    property: {
      findUnique: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push(data);
        return { ...existing, ...data };
      },
    },
  };
  const service = new PropertiesService(prisma as never, {} as never, {} as never, {} as never);

  const result = await service.updateProperty("IMM-1", { notes: "  Verificare il subalterno\r\nprima del sopralluogo.  " });

  assert.deepEqual(writes, [{ notes: "Verificare il subalterno\nprima del sopralluogo." }]);
  assert.equal(result.notes, "Verificare il subalterno\nprima del sopralluogo.");
});

test("rifiuta note immobile oltre 4000 caratteri", async () => {
  const prisma = {
    property: {
      findUnique: async () => ({
        id: "IMM-1",
        outcome: "Neutro",
        oneri: false,
        notes: "",
        imuRateOverride: null,
        imuMultiplierOverride: null,
        analysisDraft: null,
      }),
    },
  };
  const service = new PropertiesService(prisma as never, {} as never, {} as never, {} as never);

  await assert.rejects(
    () => service.updateProperty("IMM-1", { notes: "x".repeat(4001) }),
    BadRequestException,
  );
});
