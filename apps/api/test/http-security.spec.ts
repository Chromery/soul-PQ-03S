import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { UnauthorizedException } from "@nestjs/common";
import { authorizeBeforeBody, securityHeaders } from "../src/http-security.js";

test("authentication precedes JSON parsing for browser and ERP writes; security headers cover errors", async () => {
  const app = express();
  app.use(securityHeaders);
  app.use(authorizeBeforeBody(async req => {
    if (req.headers.authorization !== "Bearer user-fixture") throw new UnauthorizedException();
    return { userId: "fixture", role: "operator", email: "test@example.com", automation: false } as any;
  }, header => { if (header !== "Bearer erp-fixture") throw new UnauthorizedException(); }));
  app.use(express.json({ limit: "1kb" }));
  app.post("/api/upload", (_req, res) => res.json({ ok: true }));
  app.post("/api/integrations/erp/v1/studi/sync", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    for (const route of ["/api/upload", "/api/integrations/erp/v1/studi/sync"]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "invalid-json",
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("x-powered-by"), null);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.match(response.headers.get("cache-control")!, /no-store/);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/upload`, { method: "POST",
      headers: { authorization: "Bearer user-fixture", "content-type": "application/json" }, body: "{}" })).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
