import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkImuLibrary, readImuRecords } from "./check-imu-library.mjs";
const pdf = Buffer.from("%PDF-1.7\nVerified test document\n%%EOF\n");
const sha256 = createHash("sha256").update(pdf).digest("hex");
const record = { sourcePath: "delibere/COMUNE/2026/atto.pdf", sha256 };
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pq-imu-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test("an empty or incomplete volume fails even when the dataset contains valid rates", async t => {
  const root = await fixture(t);
  let report = await checkImuLibrary([record], root);
  assert.equal(report.ok, false); assert.equal(report.missing, 1);
  await mkdir(path.dirname(path.join(root, record.sourcePath)), { recursive: true });
  await writeFile(path.join(root, record.sourcePath), pdf);
  report = await checkImuLibrary([record, {...record, sourcePath:"delibere/second.pdf"}], root);
  assert.equal(report.verified, 1); assert.equal(report.missing, 1); assert.equal(report.ok, false);
});
test("the checker accepts the exact PDF and rejects corrupted or substituted documents", async t => {
  const root = await fixture(t), target = path.join(root, record.sourcePath);
  await mkdir(path.dirname(target), {recursive:true});
  for (const [data, valid] of [[pdf,true],[Buffer.from("%PDF-1.7\nDifferent version"),false],[Buffer.from("<html>Not a PDF</html>"),false]]) {
    await writeFile(target, data);
    const report = await checkImuLibrary([record], root);
    assert.equal(report.ok, valid); assert.equal(report.invalid, valid ? 0 : 1);
    assert.equal(report.bytes, valid ? pdf.length : 0);
  }
});
test("paths and symlinks outside the library cannot satisfy verification", async t => {
  const root = await fixture(t), library=path.join(root,"library");
  await mkdir(library);await writeFile(path.join(root,"outside.pdf"),pdf);
  await symlink(path.join(root,"outside.pdf"),path.join(library,"link.pdf"));
  const report = await checkImuLibrary(["../outside.pdf",path.join(root,"outside.pdf"),"link.pdf"].map(sourcePath=>({...record,sourcePath})),library);
  assert.equal(report.invalid,3); assert.equal(report.verified,0);
});
test("reads the deployed generated dataset and refuses an empty manifest", async t => {
  const root = await fixture(t), dataset=path.join(root,"rates.ts");
  await writeFile(dataset,`export const IMU_RATE_RECORDS: ImuRateRecord[] = ${JSON.stringify([record])};\n`);
  assert.deepEqual(await readImuRecords(dataset),[record]);
  await writeFile(dataset,"export const IMU_RATE_RECORDS: ImuRateRecord[] = [];");
  await assert.rejects(readImuRecords(dataset),/vuoto/);
});
