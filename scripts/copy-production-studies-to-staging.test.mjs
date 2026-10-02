import test from "node:test";
import assert from "node:assert/strict";
import { rewriteFixtureJson } from "./copy-production-studies-to-staging.mjs";

test("staging copies remap references, not measured values or geometry", () => {
  const ids = new Map([["4631", "sample-study-4631"], ["1571806", "sample-property-1571806"], ["group", "sample-group"]]);
  const payload = { propertyId: "1571806", groupId: "group", propertyIds: ["1571806"],
    document: { kind: "remote", url: "https://pq-soul.rainailab.com/api/properties/1571806/documents/planimetria/download" },
    selections: [{ id: "shape-1", label: "4631", cost: "1571806", points: [[4631, 22]], ruleId: "other" }] };
  const copied = rewriteFixtureJson(payload, ids);
  assert.equal(copied.propertyId, "sample-property-1571806");
  assert.equal(copied.groupId, "sample-group");
  assert.deepEqual(copied.propertyIds, ["sample-property-1571806"]);
  assert.equal(copied.document.url, "/api/properties/sample-property-1571806/documents/planimetria/download");
  assert.deepEqual(copied.selections, payload.selections);
  assert.equal(payload.propertyId, "1571806");
  assert.equal(rewriteFixtureJson(null, ids), null);
});
