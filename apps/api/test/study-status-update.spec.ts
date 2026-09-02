import assert from "node:assert/strict";
import test from "node:test";
import { StudiesService } from "../src/studies/studies.service.js";

function studyFixture(status: string, concludedAt: Date | null) {
  const day = new Date("2026-09-01T00:00:00.000Z");
  return {
    id: "STUDIO-ESITO-1",
    studyGroupId: null,
    companyErpId: null,
    company: "Esito Test Srl",
    vat: "IT00000000000",
    comune: "Bergamo",
    provincia: "BG",
    region: "Lombardia",
    status,
    createdAt: day,
    concludedAt,
    deadline: day,
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
    importedAt: day,
    updatedAt: day,
    properties: [],
    versions: [],
    studyGroup: null,
  };
}

test("il PATCH dello studio salva una nuova data esito quando l'esito cambia", async () => {
  let persistedData: Record<string, unknown> | null = null;
  const oldDate = new Date("2026-08-20T00:00:00.000Z");
  const beforeUpdate = Date.now();
  const prisma = {
    feasibilityStudy: {
      findUnique: async () => ({
        id: "STUDIO-ESITO-1",
        status: "Aperta",
        company: "Esito Test Srl",
        concludedAt: oldDate,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        persistedData = data;
        return studyFixture(String(data.status), data.concludedAt as Date);
      },
    },
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);

  const updated = await service.update("STUDIO-ESITO-1", { status: "Negativa" });
  const savedDate = persistedData?.concludedAt;

  assert.equal(updated?.status, "Negativa");
  assert.ok(savedDate instanceof Date);
  assert.ok(savedDate.getTime() >= beforeUpdate);
  assert.notEqual(savedDate.toISOString(), oldDate.toISOString());
});

test("il PATCH conserva la data esito quando l'esito resta invariato", async () => {
  let persistedData: Record<string, unknown> | null = null;
  const oldDate = new Date("2026-08-20T00:00:00.000Z");
  const prisma = {
    feasibilityStudy: {
      findUnique: async () => ({
        id: "STUDIO-ESITO-1",
        status: "Sospesa",
        company: "Esito Test Srl",
        concludedAt: oldDate,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        persistedData = data;
        return studyFixture(String(data.status), data.concludedAt as Date);
      },
    },
  };
  const service = new StudiesService(prisma as never, {} as never, {} as never);

  await service.update("STUDIO-ESITO-1", { status: "Sospesa" });

  assert.equal(persistedData?.concludedAt, oldDate);
});
