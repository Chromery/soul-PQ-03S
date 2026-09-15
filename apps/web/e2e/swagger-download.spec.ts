import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { readFileSync } from "node:fs";

test("Swagger downloads with a renewed Clerk token and handles failures without downloading JSON", async ({ page }) => {
  // Only the UI role is mocked. The actual staging test identity remains operator;
  // no account permissions or customer data are changed.
  const document = readFileSync("../../docs/openapi/erp-pq-sync.openapi.yaml", "utf8");
  let status = 200;
  let downloads = 0;
  let tokenRefreshes = 0;
  page.on("download", () => downloads++);
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname.includes("/tokens")) tokenRefreshes++;
  });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      return route.fulfill({ json: { ...await response.json(), role: "admin" } });
    }
    if (path.startsWith("/api/auth/")) return route.fallback();
    if (path === "/api/system/erp-openapi") {
      const token = route.request().headers().authorization;
      expect(Boolean(token?.startsWith("Bearer "))).toBe(true);
      expect(new URL(route.request().url()).search).toBe("");
      // A real authenticated backend request still denies this operator access.
      const denied = await route.fetch();
      expect(denied.status()).toBe(403);
      return route.fulfill({ status, contentType: status === 200 ? "application/yaml" : "application/json",
        body: status === 200 ? document : JSON.stringify({ message: "error", statusCode: status }) });
    }
    return route.fulfill({ json: path === "/api/studies" || path.includes("activities") ? [] : null });
  });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto("/impostazioni");
  const button = page.getByRole("button", { name: "Scarica Swagger ERP", exact: true });
  await expect(button).toBeVisible();
  const before = tokenRefreshes;
  const downloadEvent = page.waitForEvent("download");
  await button.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("erp-pq-sync.openapi.yaml");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe(document);
  expect(tokenRefreshes).toBeGreaterThan(before);
  for (const [code, message] of [[401, "Sessione scaduta. Accedi nuovamente a PQ e riprova."],
    [403, "Il download Swagger è riservato agli amministratori."],
    [500, "Download Swagger non riuscito. Riprova tra poco."]] as const) {
    status = code;
    await button.click();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(button).toBeEnabled();
    expect(downloads).toBe(1);
  }
});

test("Swagger settings remain unavailable to operators", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await page.goto("/impostazioni");
  await expect(page.getByRole("heading", { name: "Impostazioni riservate" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scarica Swagger ERP" })).toHaveCount(0);
});
