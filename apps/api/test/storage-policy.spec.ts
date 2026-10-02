import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PDFDocument } from "pdf-lib";
import { assertStorageKey, assertDocumentStorageKey, decodePdfUpload, safeStoragePart } from "../src/erp-sync/storage-policy.js";
import { DocumentStorageService } from "../src/erp-sync/document-storage.service.js";

test("PDF upload validates decoded bytes and structure before any storage write", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  assert.deepEqual(await decodePdfUpload(bytes.toString("base64")), bytes);
  assert.deepEqual(await decodePdfUpload("data:application/pdf;base64," + bytes.toString("base64")), bytes);
  for (const payload of ["", "invalid!", Buffer.from("not pdf").toString("base64"),
    Buffer.from("%PDF-1.7\ninvalid\n%%EOF").toString("base64"),
    bytes.subarray(0, bytes.length - 20).toString("base64"), "data:text/html;base64,SGVsbG8="]) {
    await assert.rejects(() => decodePdfUpload(payload), BadRequestException);
  }
  const svc = new DocumentStorageService(new ConfigService({ S3_KEY_PREFIX: "staging" }));
  let writes = 0;
  Object.assign(svc, { putObject: async () => { writes++; } });
  const input = { studioErpId: "1", immobileErpId: "2", tipo: "planimetria", fileNome: "test.pdf", fileBase64: bytes.toString("base64") };
  await assert.rejects(() => svc.storeBase64Pdf({ ...input, fileBase64: "bad!" }), BadRequestException);
  await assert.rejects(() => svc.storeBase64Pdf({ ...input, studioErpId: ".." }), BadRequestException);
  assert.equal(writes, 0);
  assert.match((await svc.storeBase64Pdf(input)).storageKey, /^staging\/1\/2\/planimetria\//);
  assert.equal(writes, 1);
});

test("document storage rejects namespace escapes and backup access", async () => {
  for (const key of ["backups/postgres/x.dump", "../erp/x", "/erp/x", "erp/../x", "erp//x", "erp/./x", "erp/%2e%2e/x", "erp\\x"]) {
    assert.throws(() => assertStorageKey(key), BadRequestException);
  }
  assert.throws(() => safeStoragePart(".."), BadRequestException);
  assert.doesNotThrow(() => assertDocumentStorageKey("staging/samples/20261002/document.pdf", "staging"));
  assert.throws(() => assertDocumentStorageKey("erp/1/2/test.pdf", "staging"), BadRequestException);
  assert.throws(() => assertDocumentStorageKey("staging-other/a", "staging"), BadRequestException);
  const svc = new DocumentStorageService(new ConfigService({ S3_KEY_PREFIX: "staging" }));
  await assert.rejects(() => svc.readPdfObject("erp/private.pdf"), BadRequestException);
  await assert.rejects(() => svc.deleteObject("erp/private.pdf"), BadRequestException);
  await assert.rejects(() => svc.readObject("backups/postgres/x.dump"), BadRequestException);
});
