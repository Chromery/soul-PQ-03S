import { test, expect } from "./fixtures";
import { clerk } from "@clerk/testing/playwright";

test("security headers and missing assets behave correctly; large authenticated upload reaches API without writing", async ({page,request})=>{
  const home=await request.get("/");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect((await request.get("/assets/handover-missing.js")).status()).toBe(404);
  expect((await request.get("/.env")).status()).toBe(403);
  expect((await request.post("/api/integrations/erp/v1/studi/sync",{data:"invalid-json",headers:{"content-type":"application/json"}})).status()).toBe(401);
  await page.goto("/");await clerk.signIn({page,emailAddress:process.env.E2E_CLERK_USER_EMAIL!});
  await expect(page.getByLabel("Operatore corrente")).toBeVisible();
  const result=await page.evaluate(async()=>{
    const missing=await fetch("/api/properties/handover-absent-property/documents/planimetria",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({file_name:"fixture.pdf",file_base64:"A".repeat(2*1024*1024)})});
    const profile=await fetch("/api/auth/me");
    return {status:missing.status,error:await missing.json(),cache:profile.headers.get("cache-control"),powered:profile.headers.get("x-powered-by")};
  });
  expect(result.status).toBe(404);expect(result.error.message).toMatch(/Immobile non trovato/i);expect(result.cache).toContain("no-store");expect(result.powered).toBeNull();
});
