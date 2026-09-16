import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Reflector } from "@nestjs/core";
import { load } from "js-yaml";
import { SystemController } from "../src/system/system.controller.js";
import { AuthGuard } from "../src/auth/auth.guard.js";

test("Swagger download is the versioned YAML and requires Clerk admin, never external auth", async () => {
  const controller = new SystemController({} as never);
  const headers = new Map<string, string>();
  const targets = [controller.downloadErpOpenapi, SystemController];
  const reflector = new Reflector();
  assert.equal(reflector.getAllAndOverride("pq.adminOnly", targets), true);
  assert.notEqual(reflector.getAllAndOverride("pq.externalAuthentication", targets), true);
  const context = { getHandler: () => targets[0], getClass: () => targets[1],
    switchToHttp: () => ({ getRequest: () => ({}) }) };
  const adminGuard = new AuthGuard({ authenticate: async () => ({ role: "admin" }) } as never, reflector);
  assert.equal(await adminGuard.canActivate(context as never), true);
  const operatorGuard = new AuthGuard({ authenticate: async () => ({ role: "operator" }) } as never, reflector);
  await assert.rejects(operatorGuard.canActivate(context as never), { status: 403 });
  const download = await controller.downloadErpOpenapi({ setHeader: (key: string, value: string) => headers.set(key, value) } as never);
  const chunks = [];
  for await (const chunk of download.getStream()) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString();
  assert.equal(text, await readFile(new URL("../../../docs/openapi/erp-pq-sync.openapi.yaml", import.meta.url), "utf8"));
  assert.equal(headers.get("Cache-Control"), "no-store");
  assert.match(headers.get("Content-Disposition")!, /^attachment;/);
  const spec = load(text) as any;
  assert.equal(spec.info.version, "1.5.4");
  assert.deepEqual(spec.components.schemas.MetricheStudioOutput.properties.valore_ottimizzazione.type, ["string", "null"]);
  assert.deepEqual(spec.paths["/system/erp-openapi"].get.security, [{ clerkSession: [] }, { clerkBearer: [] }]);
});
