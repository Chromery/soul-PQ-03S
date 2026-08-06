import assert from "node:assert/strict";
import test from "node:test";
import { ActivitiesService } from "../src/activities/activities.service.js";

test("ERP sync creates one summary activity with all study ids", async () => {
  let storedData: Record<string, unknown> | null = null;
  const createdAt = new Date("2026-08-05T20:45:00.000Z");
  const prisma = {
    activityEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        storedData = data;
        return { id: "activity-1", createdAt, ...data };
      },
    },
  };
  const service = new ActivitiesService(prisma as never);
  const streamed: unknown[] = [];
  const subscription = service.stream().subscribe((event) => streamed.push(event));

  const activity = await service.recordErpSync({
    studyIds: ["S-002", "S-001", "S-002"],
    createdCount: 1,
    updatedCount: 1,
  });

  subscription.unsubscribe();
  assert.deepEqual(activity.studyIds, ["S-002", "S-001"]);
  assert.equal(activity.title, "2 studi sincronizzati dall’ERP");
  assert.equal(activity.description, "S-002, S-001 · 1 nuovo, 1 aggiornato");
  assert.equal(storedData?.type, "ERP_SYNC");
  assert.equal(streamed.length, 2);
  assert.deepEqual(streamed[1], { type: "activity", data: activity });
});

test("study conclusion activity identifies study and source", async () => {
  const prisma = {
    activityEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: "activity-2",
        createdAt: new Date("2026-08-05T20:46:00.000Z"),
        ...data,
      }),
    },
  };
  const service = new ActivitiesService(prisma as never);
  const activity = await service.recordStudyConcluded({
    studyId: "S-003",
    company: "Cliente Test Srl",
    source: "PQ",
  });

  assert.equal(activity.type, "STUDY_CONCLUDED");
  assert.equal(activity.title, "Studio S-003 impostato come concluso");
  assert.equal(activity.description, "Cliente Test Srl");
  assert.deepEqual(activity.studyIds, ["S-003"]);
  assert.equal(activity.source, "PQ");
});
