import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import { DocumentStorageService } from "../src/erp-sync/document-storage.service.js";
import { ErpSyncService } from "../src/erp-sync/erp-sync.service.js";

async function fixture(error?: unknown) {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const input = { studioErpId: "test-study", immobileErpId: "test-property", tipo: "visura_catastale", fileNome: "test.pdf", fileBase64: Buffer.from(await pdf.save()).toString("base64") };
  const service = new DocumentStorageService(new ConfigService({ S3_BUCKET: "private-bucket", S3_KEY_PREFIX: "erp" }));
  const logs: string[] = [];
  let calls = 0;
  Object.assign(service, { s3Client: { send: async () => { calls++; if (error) throw error; return {}; } }, logger: { error: (value: string) => logs.push(value) } });
  return { service, input, logs, calls: () => calls };
}

const suspended = { name: "UserSuspended", Code: "UserSuspended", message: "secret SDK response", BucketName: "private-bucket", $metadata: { httpStatusCode: 403, requestId: "provider-request-id" } };

test("S3 account suspension becomes an explicit 503 without SDK secrets", async () => {
  const f = await fixture(suspended);
  await assert.rejects(f.service.storeBase64Pdf(f.input), (error: unknown) => {
    assert.ok(error instanceof ServiceUnavailableException);
    const response = error.getResponse() as Record<string, unknown>;
    assert.equal(error.getStatus(), 503);
    assert.equal(response.code, "STORAGE_UNAVAILABLE");
    assert.equal(response.reason, "ACCOUNT_SUSPENDED");
    assert.match(String(response.message), /account sospeso/);
    assert.doesNotMatch(JSON.stringify(response), /private-bucket|secret SDK|provider-request-id/);
    return true;
  });
  assert.equal(f.calls(), 1);
  assert.equal(f.logs.length, 1);
  assert.equal(JSON.parse(f.logs[0]).providerRequestId, "provider-request-id");
  assert.doesNotMatch(f.logs[0], /private-bucket|secret SDK|test\.pdf/);
});

test("S3 rejection and network failures report storage unavailable for upload, download and delete", async () => {
  for (const failure of [{ name: "AccessDenied", $metadata: { httpStatusCode: 403 } }, { name: "ServiceUnavailable", $metadata: { httpStatusCode: 503 } }, { code: "ECONNRESET" }, { name: "TimeoutError" }, { code: "ENOTFOUND" }]) {
    const f = await fixture(failure);
    for (const operation of [() => f.service.storeBase64Pdf(f.input), () => f.service.readPdfObject("erp/test/document.pdf"), () => f.service.deleteObject("erp/test/document.pdf")]) {
      await assert.rejects(operation(), (error: unknown) => {
        assert.ok(error instanceof ServiceUnavailableException);
        assert.equal((error.getResponse() as any).reason, "UNAVAILABLE");
        return true;
      });
    }
  }
});

test("missing files remain 404, missing buckets become 503, programming errors remain unmasked", async () => {
  for (const failure of [{ name: "NoSuchKey", $metadata: { httpStatusCode: 404 } }, { name: "NotFound" }]) {
    const f = await fixture(failure);
    await assert.rejects(f.service.readPdfObject("erp/test/missing.pdf"), NotFoundException);
    assert.equal(f.logs.length, 0);
  }
  const f = await fixture({ name: "NoSuchBucket", $metadata: { httpStatusCode: 404 } });
  await assert.rejects(f.service.readPdfObject("erp/test/document.pdf"), ServiceUnavailableException);
  const bug = new TypeError("programming error");
  const broken = await fixture(bug);
  await assert.rejects(broken.service.storeBase64Pdf(broken.input), error => error === bug);
});

test("invalid PDF and checksum remain 400 without contacting storage; successful uploads are unchanged", async () => {
  const f = await fixture();
  await assert.rejects(f.service.storeBase64Pdf({ ...f.input, fileBase64: "invalid!" }), BadRequestException);
  await assert.rejects(f.service.storeBase64Pdf({ ...f.input, expectedSha256: "0".repeat(64) }), BadRequestException);
  assert.equal(f.calls(), 0);
  const stored = await f.service.storeBase64Pdf(f.input);
  assert.match(stored.storageKey, /^erp\/test-study\/test-property\/visura_catastale\//);
  assert.equal(stored.sha256.length, 64);
  assert.ok(stored.sizeBytes > 0);
});

test("ERP sync propagates storage 503 before saving the current study, properties or versions", async () => {
  const f = await fixture(suspended);
  let writes = 0;
  const write = async () => { writes++; };
  const prisma = { feasibilityStudy: { findUnique: async () => null, upsert: write }, property: { findMany: async () => [], upsert: write }, studyVersion: { upsert: write } };
  const sync = new ErpSyncService(prisma as never, f.service, {} as never, {} as never, {} as never, {} as never, {} as never, new ConfigService());
  await assert.rejects(sync.syncStudies({ studi: [{ studio_erp_id: f.input.studioErpId, ragione_sociale: "Test", partita_iva: "IT00000000000", immobili: [{ immobile_erp_id: f.input.immobileErpId, ubicazione: "CHERASCO(CN) VIA LA MORRA 8", categoria: " Cat.D/7", documenti: [{ tipo: f.input.tipo, file_nome: f.input.fileNome, file_base64: f.input.fileBase64 }] }] }] }), ServiceUnavailableException);
  assert.equal(writes, 0);
  assert.equal(f.calls(), 1);
});
