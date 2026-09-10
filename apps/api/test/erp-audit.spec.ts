import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express, { json } from "express";
import type { AddressInfo } from "node:net";
import { ErpAuditService } from "../src/erp-sync/erp-audit.service.js";
import { sanitizeErpAudit } from "../src/erp-sync/erp-audit-sanitize.js";

test("ERP audit preserves financial fields and removes nested binaries, secrets and signed URL credentials", () => {
  const binary = Buffer.from("%PDF-1.7 attachment ".repeat(100)).toString("base64");
  const payload = { sync_id_erp: "SYNC-1", studi: [{ studio_erp_id: "78", immobili: [{ immobile_erp_id: "46432",
    rendita_proposta: "963497.67", data_esito: null, note: "Nota da conservare", documenti: [{ file_nome: "planimetria.pdf", mime_type: "application/pdf",
      file_base64: binary, fileData: [1, 2, 3], metadata: { token: "secret-test" },
      file_url: "https://user:password@example.com/document.pdf?X-Amz-Signature=SECRET&name=document.pdf" }] }] }],
    authorization: "Bearer bad", secret_key: "hidden", notes: "Credenziale nota secret-test" };
  const result = sanitizeErpAudit(payload, ["secret-test"]);
  const serialized = JSON.stringify(result);
  assert.equal(result.truncated, false);
  assert.ok(serialized.includes("963497.67") && serialized.includes("planimetria.pdf") && serialized.includes("Nota da conservare"));
  for (const secret of [binary, "secret-test", "SECRET", "user:password", "Bearer bad", "hidden"]) assert.ok(!serialized.includes(secret));
  assert.ok(serialized.includes("attachment_content"));
  assert.equal(payload.studi[0].immobili[0].documenti[0].file_base64, binary, "original request must not be mutated");
});

test("ERP audit bounds large/deep payloads with visible truncation", () => {
  const result = sanitizeErpAudit({ notes: "x ".repeat(100000), other: "lost" }, [], 1000);
  assert.equal(result.truncated, true);
  assert.ok(JSON.stringify(result).length < 1500);
  const circular: any = {}; circular.self = circular;
  assert.ok(JSON.stringify(sanitizeErpAudit(circular)).includes("CIRCULAR"));
});

test("ERP audit logs before business processing, outcomes, invalid JSON, unauthorized attempts and binary downloads", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pq-erp-audit-test-"));
  const audit = new ErpAuditService({ get: () => directory } as never, { assertAuthorized: (value: string) => {
    if (value !== "Bearer test-audit-token") throw Error("Unauthorized");
  } } as never);
  await audit.onModuleInit();
  const app = express();
  app.use(audit.track); app.use(json({ limit: "2kb", verify: audit.recordRaw })); app.use(audit.capture);
  app.post("/api/integrations/erp/v1/studi/sync", async (req, res) => {
    if (req.headers.authorization !== "Bearer test-audit-token") { res.status(401).json({ message: "Unauthorized" }); return; }
    const saved = await audit.get(String(res.getHeader("X-PQ-Request-Id")));
    assert.equal((saved.requestBody as any).studi[0].immobili[0].rendita_proposta, "963497.67");
    if (req.body.fail) { res.status(400).json({ message: "Studio non valido" }); return; }
    res.json({ sync_id_pq: "PQ-SYNC-1", risultati: [{ studio_erp_id: "78" }] });
  });
  app.get("/api/integrations/erp/v1/presentazioni/test/pdf", (_req, res) => res.type("pdf").send(Buffer.from("%PDF-FAKE-CONTENT")));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const body = { sync_id_erp: "ERP-1", studi: [{ studio_erp_id: "78", immobili: [{ rendita_proposta: "963497.67", file_base64: "JVBERi0=" }] }] };
  const send = (data: unknown, token = "test-audit-token") => fetch(`${base}/api/integrations/erp/v1/studi/sync`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: typeof data === "string" ? data : JSON.stringify(data) });
  const finish = async (response: globalThis.Response) => {
    await response.text(); await new Promise(resolve => setTimeout(resolve, 20)); await (audit as any).queue;
    return audit.get(response.headers.get("x-pq-request-id")!);
  };
  try {
    const success = await finish(await send(body));
    assert.equal(success.statusCode, 200); assert.equal(success.state, "completed"); assert.equal(success.syncIdErp, "ERP-1");
    assert.equal(success.syncIdPq, "PQ-SYNC-1"); assert.deepEqual(success.studyIds, ["78"]);
    assert.ok(success.requestSha256 && success.requestBytes && success.durationMs !== undefined);
    assert.equal(Date.parse(success.expiresAt) - Date.parse(success.createdAt), 10 * 86400000);
    assert.equal((await finish(await send({ ...body, fail: true }))).statusCode, 400);
    const malformed = await finish(await send("{broken-json-secret"));
    assert.equal(malformed.statusCode, 400); assert.equal(malformed.requestBody, undefined); assert.equal(malformed.responseBody, undefined);
    const unauthorized = await finish(await send({ password: "DO_NOT_STORE" }, "wrong"));
    assert.equal(unauthorized.statusCode, 401); assert.equal(unauthorized.authorized, false); assert.equal(unauthorized.requestBody, undefined);
    const oversized = await finish(await send({ extra: "x".repeat(3000) }));
    assert.equal(oversized.statusCode, 413); assert.equal(oversized.requestBody, undefined);
    const pdf = await finish(await fetch(`${base}/api/integrations/erp/v1/presentazioni/test/pdf`, { headers: { authorization: "Bearer test-audit-token" } }));
    assert.equal(pdf.responseBody, undefined); assert.equal(pdf.responseBytes, 17);
    assert.equal((await fetch(`${base}/api/health`)).headers.get("x-pq-request-id"), null);
    assert.equal((await audit.list("78", "ERP-1")).total, 2);
    assert.equal((await audit.list()).total, 6);
    const stored = (await Promise.all((await readdir(directory)).map(file => readFile(path.join(directory, file), "utf8")))).join("");
    for (const secret of ["DO_NOT_STORE", "broken-json-secret", "JVBERi0=", "%PDF-FAKE-CONTENT", "test-audit-token"]) assert.ok(!stored.includes(secret));
    await assert.rejects(audit.get("../secret"));
    await assert.rejects(audit.list(undefined, undefined, 1000));
    const oldId = randomUUID();
    await writeFile(path.join(directory, `${oldId}.json`), JSON.stringify({ ...success, id: oldId, expiresAt: "2020-01-01T00:00:00Z" }));
    await assert.rejects(audit.get(oldId), /scaduto/);
    await (audit as any).cleanup();
    assert.ok(!(await readdir(directory)).includes(`${oldId}.json`));
    // New service instance reads logs after restart without any in-memory state.
    const restarted = new ErpAuditService({ get: () => directory } as never, {} as never);
    await restarted.onModuleInit(); assert.equal((await restarted.get(success.id)).statusCode, 200); await restarted.onModuleDestroy();
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await audit.onModuleDestroy(); await rm(directory, { recursive: true, force: true });
  }
});

test("audit storage failure does not reject sync and is signaled in headers and health metadata", async () => {
  const audit = new ErpAuditService({ get: () => "/proc/pq-audit-unwritable" } as never, { assertAuthorized: () => {} } as never);
  // Deliberately do not initialize: simulates a failed volume mount.
  const app = express(); app.use(audit.track); app.use(json()); app.use(audit.capture);
  app.post("/api/integrations/erp/v1/studi/sync", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const result = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/integrations/erp/v1/studi/sync`, { method: "POST" });
    assert.equal(result.status, 200); assert.equal(result.headers.get("x-pq-audit-status"), "unavailable"); await result.text();
    assert.ok((await audit.list()).storage.failures > 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await audit.onModuleDestroy(); }
});
