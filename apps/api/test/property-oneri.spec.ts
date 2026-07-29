import assert from "node:assert/strict";
import test from "node:test";
import {
  estimatedRenditaFromAnalysisDraft,
  estimatedRenditaFromDraftPayload,
} from "../src/rendita.js";
import { PropertiesService } from "../src/properties/properties.service.js";

test("applica gli Oneri solo alle destinazioni prima di sommare il lotto", () => {
  const payload = {
    totalBaseAmount: 10_000,
    totalLotValue: 1_000,
    totalEstimatedAmount: 11_000,
    totalEstimatedRendita: 220,
  };

  assert.equal(estimatedRenditaFromDraftPayload(payload, false), 220);
  assert.equal(estimatedRenditaFromDraftPayload(payload, true), 300);
  assert.equal(
    estimatedRenditaFromAnalysisDraft(
      {
        payload,
        totalEstimatedValue: 220 as never,
      },
      true,
    ),
    300,
  );
});

test("mantiene la compatibilità con le bozze precedenti prive dei totali separati", () => {
  assert.equal(
    estimatedRenditaFromDraftPayload(
      {
        totalEstimatedAmount: 11_000,
        totalEstimatedRendita: 220,
      },
      false,
    ),
    220,
  );
  assert.equal(
    estimatedRenditaFromDraftPayload(
      {
        totalEstimatedAmount: 11_000,
        totalLotValue: 1_000,
      },
      true,
    ),
    300,
  );
});

test("il flag Oneri ricalcola e persiste subito rendita proposta e IMU", async () => {
  let property = {
    id: "I-ONERI",
    studyId: "S-ONERI",
    outcome: "Neutro",
    categoria: "D/7",
    comune: "Milano",
    provincia: "MI",
    currentRendita: 200,
    estimatedRendita: 220,
    currentImu: 200,
    estimatedImu: 220,
    imuDiff: 20,
    diffPercent: 10,
    imuRateOverride: null,
    imuMultiplierOverride: null,
    oneri: false,
    hasStudy: true,
    analysisDraft: {
      payload: {
        totalBaseAmount: 10_000,
        totalLotValue: 1_000,
        totalEstimatedAmount: 11_000,
        totalEstimatedRendita: 220,
      },
      totalEstimatedValue: 220,
    },
  };
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
      update: async () => undefined,
    },
  };
  const service = new PropertiesService(
    prisma as never,
    {} as never,
    {
      calculate: ({ rendita }: { rendita: number }) => ({
        status: "calculated",
        amount: rendita,
      }),
    } as never,
    {} as never,
  );

  const updated = await service.updateProperty(property.id, { oneri: true });

  assert.equal(updated.oneri, true);
  assert.equal(updated.estimatedRendita, 300);
  assert.equal(updated.estimatedImu, 300);
  assert.equal(updated.imuDiff, 100);
  assert.equal(property.oneri, true);
  assert.equal(property.estimatedRendita, 300);
});
