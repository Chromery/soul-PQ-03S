import assert from "node:assert/strict";
import test from "node:test";
import { validateSync } from "class-validator";
import { buildGroupingSuggestions } from "../src/studies/property-grouping-suggestions.js";
import { PropertyGroupingSuggestionsService } from "../src/studies/property-grouping-suggestions.service.js";
import { ReviewGroupingSuggestionDto } from "../src/studies/property-grouping-suggestions.controller.js";
import { StudiesService } from "../src/studies/studies.service.js";

const property = (id: string, overrides = {}) => ({ id, comune: "Milano", provincia: "MI", foglio: "12", particella: "34",
  subalterno: id, sezioneCatastale: null, codiceComuneCatastale: null, valuationGroupId: null, ...overrides });

test("suggestions match sheet and parcel with distinct subs, normalizing zeros and municipality suffixes", () => {
  const items = [property("1", { foglio: "012", particella: "034", comune: "MILANO (MI)" }), property("2")];
  const [result] = buildGroupingSuggestions("study", items);
  assert.deepEqual(result.propertyIds, ["1", "2"]);
  assert.equal(result.matchField, "particella");
  assert.equal(result.foglio, "12"); assert.equal(result.matchValue, "34");
  assert.equal(result.id, buildGroupingSuggestions("study", [...items].reverse())[0].id);
  assert.notEqual(result.id, buildGroupingSuggestions("other-study", items)[0].id);
  assert.notEqual(result.id, buildGroupingSuggestions("study", [...items, property("3")])[0].id);
});

test("suggestions exclude wrong municipality, province, section, parcel, missing fields, duplicate subs and existing groups", () => {
  for (const second of [property("2", { comune: "Bergamo" }), property("2", { provincia: "BG" }),
    property("2", { sezioneCatastale: "A" }), property("2", { particella: "99" }), property("2", { foglio: "" }),
    property("2", { subalterno: null }), property("2", { subalterno: "01" }), property("2", { foglio: "12,13" }),
    property("2", { valuationGroupId: "already-grouped" })]) {
    assert.equal(buildGroupingSuggestions("study", [property("1"), second]).length, 0);
  }
  assert.equal(buildGroupingSuggestions("study", [property("1", { comune: "", provincia: null }), property("2", { comune: "", provincia: null })]).length, 0);
});

function fixture() {
  const properties = [property("1"), property("2")];
  const dismissed = new Map<string, Date>();
  const writes: any[] = [];
  let found = true, conflict = false;
  const prisma: any = { feasibilityStudy: { findUnique: async () => found ? { id: "study", properties } : null },
    propertyGroupingDismissal: {
      findMany: async () => [...dismissed].map(([signature, rejectedAt]) => ({ signature, rejectedAt })),
      upsert: async ({ create }: any) => { writes.push({ reject: create }); if (!dismissed.has(create.signature)) dismissed.set(create.signature, new Date("2026-09-15T12:00:00Z")); },
      deleteMany: async ({ where }: any) => { dismissed.delete(where.signature); },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { assert.ok(strings.join("").includes("FOR UPDATE")); assert.deepEqual(values, ["study"]); },
    propertyValuationGroup: { create: async (args: any) => { writes.push(args); return { id: "new-group" }; } },
    property: { updateMany: async (args: any) => { writes.push(args); if (conflict) return { count: 0 };
      for (const property of properties) if (args.where.id.in.includes(property.id)) property.valuationGroupId = args.data.valuationGroupId;
      return { count: 2 }; } },
    $transaction: async (work: any) => { const snapshot = structuredClone(properties), saved = new Map(dismissed), count = writes.length;
      try { return await work(prisma); } catch (error) { properties.splice(0, properties.length, ...snapshot); dismissed.clear(); saved.forEach((value, key) => dismissed.set(key, value)); writes.splice(count); throw error; } },
  };
  const service = new PropertyGroupingSuggestionsService(prisma, { find: async () => ({ id: "study", properties }) } as never);
  return { service, prisma, properties, dismissed, writes, missing: () => { found = false; }, conflict: () => { conflict = true; } };
}

test("rejections persist across service instances and can later be accepted without changing estimates", async () => {
  const f = fixture(); const before = structuredClone(f.properties);
  const { pending } = await f.service.list("study");
  assert.equal(pending.length, 1);
  await f.service.review("study", pending[0].id, "reject");
  const other = new PropertyGroupingSuggestionsService(f.prisma, { find: async () => ({ id: "study" }) } as never);
  const reloaded = await other.list("study");
  assert.equal(reloaded.pending.length, 0); assert.equal(reloaded.rejected.length, 1);
  assert.deepEqual(f.properties, before);
  await f.service.review("study", pending[0].id, "reject"); assert.equal(f.dismissed.size, 1);
  const accepted = await other.review("study", pending[0].id, "accept");
  assert.equal(accepted.pending.length, 0); assert.equal(accepted.rejected.length, 0);
  assert.equal(accepted.study?.id, "study");
  assert.ok(f.properties.every(property => property.valuationGroupId === "new-group"));
  assert.deepEqual(f.writes.at(-1).data, { valuationGroupId: "new-group" });
  assert.equal(f.writes.at(-1).where.valuationGroupId, null);
});

test("new imported members require a new review while stale, forged and already accepted suggestions cannot be applied", async () => {
  const f = fixture(); const [original] = (await f.service.list("study")).pending;
  await f.service.review("study", original.id, "reject");
  f.properties.push(property("3"));
  assert.equal((await f.service.list("study")).pending.length, 1);
  await assert.rejects(f.service.review("study", original.id, "accept"), /cambiato/);
  await assert.rejects(f.service.review("study", "a".repeat(64), "accept"), /cambiato/);
  await assert.rejects(f.service.review("study", "bad", "accept"), /non valido/);
  f.missing(); await assert.rejects(f.service.list("study"), /non trovato/);
});

test("concurrent membership change rolls back suggestion acceptance", async () => {
  const f = fixture(); const [candidate] = (await f.service.list("study")).pending;
  f.conflict(); await assert.rejects(f.service.review("study", candidate.id, "accept"), /già raggruppati/);
  assert.deepEqual(f.writes, []); assert.ok(f.properties.every(property => property.valuationGroupId === null));
});

test("manual grouping also refuses to overwrite a group created concurrently", async () => {
  const f = fixture(); f.conflict();
  const service = new StudiesService(f.prisma, {} as never, {} as never);
  await assert.rejects(service.groupProperties("study", ["1", "2"]), /già stati raggruppati/);
  assert.deepEqual(f.writes, []);
});

test("review action accepts only explicit accept or reject", () => {
  for (const action of ["accept", "reject"]) assert.equal(validateSync(Object.assign(new ReviewGroupingSuggestionDto(), { action })).length, 0);
  for (const action of [undefined, "delete", true, {}]) assert.ok(validateSync(Object.assign(new ReviewGroupingSuggestionDto(), { action })).length);
});
