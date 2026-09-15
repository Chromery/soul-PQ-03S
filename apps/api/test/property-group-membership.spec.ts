import assert from "node:assert/strict";
import test from "node:test";
import { validateSync } from "class-validator";
import { StudiesService } from "../src/studies/studies.service.js";
import { UpdatePropertyValuationGroupDto } from "../src/studies/dto/update-property-valuation-group.dto.js";

function fixture(withDraft = false) {
  const properties = [1, 2, 3, 4, 5].map(n => ({ id: String(n), studyId: n === 5 ? "foreign" : "study",
    valuationGroupId: n < 4 ? "original" : null as string | null, estimatedRendita: 300, diffPercent: -70,
    estimatedImu: 50, imuDiff: -50, hasStudy: true }));
  const draft = withDraft ? { payload: { selections: [{ id: "wall-1", page: 2 }], previousPropertyValues: properties.slice(0, 3).map(p => ({
    id: p.id, estimatedRendita: 100, diffPercent: -90, estimatedImu: 20, imuDiff: -80, hasStudy: false })) } } : null;
  const groups = new Set(["original"]), revisions: any[] = [];
  const match = (p: typeof properties[number], where: any) => (!where.studyId || p.studyId === where.studyId)
    && (!where.id || typeof where.id === "string" ? !where.id || p.id === where.id : where.id.in.includes(p.id))
    && (!("valuationGroupId" in where) || p.valuationGroupId === where.valuationGroupId);
  const prisma: any = {
    $queryRaw: async () => [{ id: "original" }],
    propertyValuationGroup: {
      findFirst: async ({where}: any) => where.studyId === "study" && groups.has(where.id) ? {
        id: where.id, studyId: "study", properties: structuredClone(properties.filter(p => p.valuationGroupId === where.id)), analysisDraft: draft } : null,
      create: async () => { groups.add("replacement"); return { id: "replacement" }; },
      delete: async ({where}: any) => { groups.delete(where.id); },
    },
    propertyValuationGroupRevision: { create: async ({data}: any) => revisions.push(data) },
    property: { count: async ({where}: any) => properties.filter(p => match(p, where)).length,
      updateMany: async ({where, data}: any) => { const selected = properties.filter(p => match(p, where)); selected.forEach(p => Object.assign(p, data)); return {count: selected.length}; } },
    $transaction: async (fn: any) => { const before = structuredClone(properties), oldGroups = [...groups], count = revisions.length;
      try { return await fn(prisma); } catch (e) { properties.splice(0, properties.length, ...before); groups.clear(); oldGroups.forEach(id => groups.add(id)); revisions.splice(count); throw e; } },
  };
  const service = new StudiesService(prisma, {} as never, {} as never);
  (service as any).refreshStudyTotals = async () => {};
  service.find = async () => ({ id: "study", properties } as any);
  return { service, properties, groups, revisions };
}

test("add to group preserves individual estimates, snapshots old composition and rotates editor identity", async () => {
  const f = fixture(); await f.service.updateValuationGroupMembers("study", "original", {action: "add", propertyIds: ["4"]});
  assert.ok(f.properties.slice(0, 4).every(p => p.valuationGroupId === "replacement" && p.estimatedRendita === 300));
  assert.equal(f.groups.has("original"), false); assert.equal(f.revisions.length, 1);
  assert.deepEqual(f.revisions[0].payload.previousMembers.map((p: any) => p.id), ["1", "2", "3"]);
});

test("removing a member keeps it in the study and does not affect other studies", async () => {
  const f = fixture(); await f.service.updateValuationGroupMembers("study", "original", {action: "remove", propertyIds: ["1"]});
  assert.equal(f.properties[0].valuationGroupId, null);
  assert.ok(f.properties.slice(1, 3).every(p => p.valuationGroupId === "replacement"));
  assert.equal(f.properties[4].studyId, "foreign"); assert.equal(f.properties.length, 5);
});

test("saved group requires explicit confirmation, then archives draft and restores original individual values", async () => {
  const f = fixture(true);
  await assert.rejects(f.service.updateValuationGroupMembers("study", "original", {action: "remove", propertyIds: ["1"]}), (error: any) => error.getResponse().code === "GROUP_REVIEW_REQUIRED");
  assert.equal(f.revisions.length, 0); assert.ok(f.properties.slice(0, 3).every(p => p.estimatedRendita === 300));
  await f.service.updateValuationGroupMembers("study", "original", {action: "remove", propertyIds: ["1"], resetValuation: true});
  assert.ok(f.properties.slice(0, 3).every(p => p.estimatedRendita === 100 && p.hasStudy === false));
  assert.deepEqual(f.revisions[0].payload.analysisDraft.payload.selections, [{id: "wall-1", page: 2}]);
  assert.equal(f.properties[3].estimatedRendita, 300);
});

test("a group with only one remaining member is dissolved, while its previous draft remains archived", async () => {
  const f = fixture(true); await f.service.updateValuationGroupMembers("study", "original", {action: "remove", propertyIds: ["1", "2"], resetValuation: true});
  assert.equal(f.groups.size, 0); assert.ok(f.properties.slice(0, 3).every(p => p.valuationGroupId === null));
  assert.equal(f.revisions.length, 1);
});

test("wrong study, foreign members, already grouped members, stale groups and invalid requests do not mutate data", async () => {
  for (const [studyId, groupId, action, propertyIds] of [
    ["foreign", "original", "remove", ["1"]], ["study", "missing", "remove", ["1"]],
    ["study", "original", "add", ["5"]], ["study", "original", "add", ["1"]],
    ["study", "original", "remove", ["4"]], ["study", "original", "add", []],
    ["study", "original", "remove", ["1", "1"]],
  ] as const) {
    const f = fixture(); await assert.rejects(f.service.updateValuationGroupMembers(studyId, groupId, {action, propertyIds: [...propertyIds]}));
    assert.equal(f.revisions.length, 0); assert.equal(f.groups.size, 1);
  }
});

test("membership DTO rejects malformed inputs and non-boolean reset confirmation", () => {
  assert.equal(validateSync(Object.assign(new UpdatePropertyValuationGroupDto(), {action: "add", propertyIds: ["1"]})).length, 0);
  for (const fields of [{action: "delete", propertyIds: ["1"]}, {action: "add", propertyIds: []},
    {action: "add", propertyIds: ["1", "1"]}, {action: "remove", propertyIds: ["1"], resetValuation: "true"}]) {
    assert.ok(validateSync(Object.assign(new UpdatePropertyValuationGroupDto(), fields)).length);
  }
});
