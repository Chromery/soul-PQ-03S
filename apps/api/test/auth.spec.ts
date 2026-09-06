import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService } from "../src/auth/auth.service.js";
import { AdminOnly, AuthGuard, ExternalAuthentication } from "../src/auth/auth.guard.js";
import { grantedRole, requireTrustedOrigin, sessionToken } from "../src/auth/auth.policy.js";
import { AuthController } from "../src/auth/auth.controller.js";
import type { PrismaService } from "../src/prisma/prisma.service.js";

const origin = "https://st-pq-soul.rainailab.com";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const issuer = "https://test-identity.clerk.accounts.dev";
const settings = {
  APP_ENV: "staging", CLERK_SECRET_KEY: "sk_test_fixture",
  VITE_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("test-identity.clerk.accounts.dev$").toString("base64")}`,
  CLERK_AUTHORIZED_PARTIES: origin, CLERK_JWT_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
};
function jwt(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: issuer, azp: origin, sub: "user_test", sid: "sess_test", iat: now, nbf: now - 1, exp: now + 60, ...overrides })).toString("base64url");
  const body = `${header}.${payload}`;
  return `${body}.${sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")}`;
}
function service(metadata: Record<string, unknown> = { pq: { role: "operator", environment: "staging" } }) {
  const auth = new AuthService(new ConfigService(settings));
  Object.assign(auth, { client: { users: { getUser: async () => ({ id: "user_test", firstName: "Test", privateMetadata: metadata,
    primaryEmailAddressId: "email_test", emailAddresses: [{ id: "email_test", emailAddress: "test@example.com", verification: { status: "verified" } }] }) } } });
  return auth;
}
const request = (token = jwt()) => ({ method: "GET", headers: { cookie: `__session=${token}` } }) as Request;

test("real signed Clerk session accepted; invalid, expired and other-instance tokens rejected", async () => {
  assert.equal((await service().authenticate(request())).role, "operator");
  for (const token of ["invalid", jwt({ exp: 1 }), jwt({ azp: "https://pq-soul.rainailab.com" }), jwt({ iss: "https://other.clerk.accounts.dev" }), jwt({ sid: null }), jwt({ azp: null })]) {
    await assert.rejects(() => service().authenticate(request(token)), UnauthorizedException);
  }
});
test("no Clerk configuration is fail-closed", async () => {
  await assert.rejects(() => new AuthService(new ConfigService({})).authenticate(request()), ServiceUnavailableException);
});
test("signed-in but ungranted accounts cannot enter PQ", async () => {
  await assert.rejects(() => service({}).authenticate(request()), ForbiddenException);
  assert.throws(() => grantedRole({ pq: { role: "admin", environment: "production" } }, "staging"), ForbiddenException);
  assert.throws(() => grantedRole({ pq: { role: "operator", environment: "production", automation: true } }, "production"), ForbiddenException);
  assert.deepEqual(grantedRole({ pq: { role: "operator", environment: "staging", automation: true } }, "staging"), { role: "operator", automation: true });
});
test("cookie handling does not fall back from an invalid bearer or accept ambiguous cookies", () => {
  assert.equal(sessionToken({ headers: { cookie: "other=ok; __session=jwt" } }), "jwt");
  assert.throws(() => sessionToken({ headers: { cookie: "__session=one; __session=two" } }), UnauthorizedException);
  assert.throws(() => sessionToken({ headers: { authorization: "Basic invalid", cookie: "__session=valid" } }), UnauthorizedException);
  assert.throws(() => sessionToken({ headers: {} }), UnauthorizedException);
});
test("cookie writes require a trusted origin; cross-origin requests are rejected", () => {
  assert.throws(() => requireTrustedOrigin({ method: "POST", headers: {} }, [origin]), ForbiddenException);
  assert.throws(() => requireTrustedOrigin({ method: "POST", headers: { origin: "https://evil.example" } }, [origin]), ForbiddenException);
  assert.doesNotThrow(() => requireTrustedOrigin({ method: "POST", headers: { origin } }, [origin]));
  assert.doesNotThrow(() => requireTrustedOrigin({ method: "GET", headers: {} }, [origin]));
});
test("global guard protects default routes and enforces admin role", async () => {
  class ProtectedController {}
  class AdminController {}
  class ErpController {}
  AdminOnly()(AdminController);
  ExternalAuthentication()(ErpController);
  const makeContext = (controller: unknown) => ({ getHandler: () => function endpoint() {}, getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request() }) }) as unknown as ExecutionContext;
  const guard = new AuthGuard(service(), new Reflector());
  assert.equal(await guard.canActivate(makeContext(ProtectedController)), true);
  await assert.rejects(() => guard.canActivate(makeContext(AdminController)), ForbiddenException);
  const admin = new AuthGuard(service({ pq: { role: "admin", environment: "staging" } }), new Reflector());
  assert.equal(await admin.canActivate(makeContext(AdminController)), true);
  // ERP has independent mandatory bearer checks in ErpSyncController.
  const unconfigured = new AuthGuard(new AuthService(new ConfigService({})), new Reflector());
  assert.equal(await unconfigured.canActivate(makeContext(ErpController)), true);
  await assert.rejects(() => unconfigured.canActivate(makeContext(ProtectedController)), ServiceUnavailableException);
});
test("welcome timestamp is persisted per authenticated user and idempotent", async () => {
  const rows = new Map<string, { welcomeSeenAt: Date }>();
  const prisma = { userPreferences: {
    findUnique: async ({ where }: any) => rows.get(where.clerkUserId) ?? null,
    upsert: async ({ where, create, update }: any) => {
      assert.deepEqual(update, {});
      if (!rows.has(where.clerkUserId)) rows.set(where.clerkUserId, create);
      return rows.get(where.clerkUserId);
    },
  } } as unknown as PrismaService;
  const controller = new AuthController(prisma);
  const req = { pqUser: { userId: "first" } } as any;
  assert.equal((await controller.me(req)).welcomeSeenAt, null);
  const first = await controller.welcomeSeen(req);
  assert.equal((await controller.welcomeSeen(req)).welcomeSeenAt, first.welcomeSeenAt);
  assert.equal((await controller.me({ pqUser: { userId: "second" } } as any)).welcomeSeenAt, null);
});

test("HTTP routes reject anonymous requests including direct downloads and enforce roles", async () => {
  class Studies {
    list() { return [{ id: "fixture" }]; }
    download() { return "protected"; }
  }
  class System { status() { return "admin"; } }
  class Health { status() { return "ok"; } }
  Controller("studies")(Studies);
  Get()(Studies.prototype, "list", Object.getOwnPropertyDescriptor(Studies.prototype, "list")!);
  Get("document.pdf")(Studies.prototype, "download", Object.getOwnPropertyDescriptor(Studies.prototype, "download")!);
  Controller("system")(System); AdminOnly()(System);
  Get()(System.prototype, "status", Object.getOwnPropertyDescriptor(System.prototype, "status")!);
  Controller("health")(Health); ExternalAuthentication()(Health);
  Get()(Health.prototype, "status", Object.getOwnPropertyDescriptor(Health.prototype, "status")!);
  class FixtureModule {}
  Module({ controllers: [Studies, System, Health], providers: [
    { provide: APP_GUARD, useValue: new AuthGuard(service(), new Reflector()) },
  ] })(FixtureModule);
  const app = await NestFactory.create(FixtureModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  try {
    for (const endpoint of ["/studies", "/studies/document.pdf", "/system"]) {
      assert.equal((await fetch(url + endpoint)).status, 401);
    }
    assert.equal((await fetch(url + "/health")).status, 200);
    const headers = { cookie: `__session=${jwt()}` };
    assert.equal((await fetch(url + "/studies", { headers })).status, 200);
    assert.equal((await fetch(url + "/studies/document.pdf", { headers })).status, 200);
    assert.equal((await fetch(url + "/system", { headers })).status, 403);
    assert.equal((await fetch(url + "/studies", { headers: { ...headers, authorization: "Bearer ERP-test-token" } })).status, 401);
  } finally { await app.close(); }
});
