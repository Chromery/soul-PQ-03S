import assert from "node:assert/strict";
import test from "node:test";
import { ImuCalculator } from "../src/imu/imu-calculator.js";
import type { ImuRateRecord } from "../src/imu/imu.types.js";
import { PropertiesService } from "../src/properties/properties.service.js";

const rateRecord: ImuRateRecord = {
  cadastralCode: "F205",
  municipality: "Milano",
  province: "MI",
  region: "Lombardia",
  year: 2026,
  documentType: "mef_standard_prospect",
  groupDRate: 1.06,
  ruralInstrumentalRate: 0.1,
  otherBuildingsRate: 0.96,
  actNumber: "1",
  actDate: "01/01/2026",
  publicationDate: "02/01/2026",
  sourcePath: "delibere/F205/atto.pdf",
  sha256: "a".repeat(64),
};

test("salva e ripristina l'aliquota IMU manuale conservando il valore comunale", async () => {
  let property = {
    id: "I-1",
    studyId: "S-1",
    outcome: "Neutro",
    categoria: "ZONA1CAT.D/7",
    comune: "Milano",
    provincia: "MI",
    currentRendita: 1_000,
    estimatedRendita: 2_000,
    currentImu: null,
    estimatedImu: null,
    imuRateOverride: null as number | null,
    hasStudy: true,
    analysisDraft: null,
  };
  const studyUpdates: Array<Record<string, unknown>> = [];
  const prisma = {
    property: {
      findUnique: async () => property,
      update: async (input: { data: Record<string, unknown> }) => {
        property = { ...property, ...input.data } as typeof property;
        return property;
      },
      findMany: async () => [property],
    },
    feasibilityStudy: {
      update: async (input: Record<string, unknown>) => {
        studyUpdates.push(input);
      },
    },
  };
  const calculator = new ImuCalculator([rateRecord]);
  const service = new PropertiesService(
    prisma as never,
    {} as never,
    { calculate: calculator.calculate.bind(calculator) } as never,
    {} as never,
  );

  const overridden = await service.updateProperty("I-1", { imuRateOverride: "0,9" });
  assert.equal(overridden.imuRateOverride, 0.9);
  assert.equal(overridden.currentImu, 614.25);
  assert.equal(overridden.estimatedImu, 1_228.5);
  assert.equal(overridden.currentImuCalculation?.status, "calculated");
  if (overridden.currentImuCalculation?.status === "calculated") {
    assert.equal(overridden.currentImuCalculation.rateOverridden, true);
    assert.equal(overridden.currentImuCalculation.ratePercent, 0.9);
    assert.equal(overridden.currentImuCalculation.systemRatePercent, 1.06);
  }

  const restored = await service.updateProperty("I-1", { imuRateOverride: null });
  assert.equal(restored.imuRateOverride, null);
  assert.equal(restored.currentImu, 723.45);
  assert.equal(restored.estimatedImu, 1_446.9);
  assert.equal(restored.currentImuCalculation?.status, "calculated");
  if (restored.currentImuCalculation?.status === "calculated") {
    assert.equal(restored.currentImuCalculation.rateOverridden, false);
    assert.equal(restored.currentImuCalculation.ratePercent, 1.06);
    assert.equal(restored.currentImuCalculation.systemRatePercent, 1.06);
  }
  assert.equal(studyUpdates.length, 2);
});
