import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { PropertiesService } from "../src/properties/properties.service.js";

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
