import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ErpSyncService } from "../src/erp-sync/erp-sync.service.js";

test("ERP authentication fails closed and accepts only the configured bearer", () => {
  const previous = process.env.ERP_SYNC_TOKEN;
  const authorize = (value?: string) => ErpSyncService.prototype.assertAuthorized(value);
  try {
    delete process.env.ERP_SYNC_TOKEN;
    assert.throws(() => authorize(), ServiceUnavailableException);
    process.env.ERP_SYNC_TOKEN = " ";
    assert.throws(() => authorize("Bearer  "), ServiceUnavailableException);
    process.env.ERP_SYNC_TOKEN = "test-token-not-a-real-secret";
    assert.throws(() => authorize(), UnauthorizedException);
    assert.throws(() => authorize("Bearer invalid"), UnauthorizedException);
    assert.throws(() => authorize("Bearer test-token-not-a-real-secrex"), UnauthorizedException);
    assert.doesNotThrow(() => authorize("Bearer test-token-not-a-real-secret"));
  } finally {
    if (previous === undefined) delete process.env.ERP_SYNC_TOKEN;
    else process.env.ERP_SYNC_TOKEN = previous;
  }
});
