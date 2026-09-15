import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "class-validator";
import { ArchiveStudiesDto } from "../src/studies/dto/archive-studies.dto.js";
import { StudiesService } from "../src/studies/studies.service.js";

test("archive request validates unique bounded study IDs and a strict boolean", async () => {
  for (const input of [{ studyIds: [], archived: true }, { studyIds: ["1", "1"], archived: true },
    { studyIds: [4], archived: true }, { studyIds: ["1"], archived: "false" }, { studyIds: ["1"] },
    { studyIds: Array.from({ length: 201 }, (_, i) => String(i)), archived: false }]) {
    assert.ok((await validate(Object.assign(new ArchiveStudiesDto(), input))).length > 0);
  }
  assert.equal((await validate(Object.assign(new ArchiveStudiesDto(), { studyIds: ["7"], archived: false }))).length, 0);
});

test("archive and restore are atomic, reversible and only change the compatibility flag", async () => {
  let writes: any[] = []; let found = 2;
  const service = new StudiesService({ $transaction: async (fn: any) => fn({ feasibilityStudy: {
    count: async () => found,
    updateMany: async (input: any) => { writes.push(input); return { count: 2 }; },
  } }) } as never, {} as never, {} as never);
  for (const archived of [true, false]) {
    const result = await service.archive(["7", "8"], archived);
    assert.equal(result.updated, 2);
    assert.deepEqual(writes.at(-1), { where: { id: { in: ["7", "8"] }, isTest: !archived }, data: { isTest: archived } });
  }
  writes = []; found = 1;
  await assert.rejects(service.archive(["7", "missing"], true), { status: 400 });
  assert.equal(writes.length, 0);
});
