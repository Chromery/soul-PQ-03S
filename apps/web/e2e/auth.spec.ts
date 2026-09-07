import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("anonymous API requests cannot read studies or documents", async ({ request }) => {
  for (const endpoint of ["/api/studies", "/api/activities", "/api/system/status", "/api/properties/320129/documents/planimetria/download"]) {
    expect((await request.get(endpoint)).status()).toBe(401);
  }
  expect((await request.get("/api/integrations/erp/v1/studi/modifiche")).status()).toBe(401);
});

test("staging operator signs in, retains welcome preference and cannot administer", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  await expect(page.getByLabel("Operatore corrente")).toBeVisible();
  const profile = await page.evaluate(async () => (await fetch("/api/auth/me")).json());
  expect(profile.role).toBe("operator");
  expect(profile.automation).toBe(true);
  expect(typeof profile.firstName).toBe("string");
  expect(typeof profile.lastName).toBe("string");
  expect(profile).toHaveProperty("jobTitle");
  await expect(page.getByLabel("Operatore corrente").locator(".operator-name")).toHaveText(profile.name);
  const welcome = page.getByRole("dialog", { name: /Benvenuto in PQ/ });
  if (!profile.welcomeSeenAt) {
    await expect(welcome).toBeVisible();
    const saved = page.waitForResponse((response) => response.url().endsWith("/api/auth/welcome-seen") && response.ok());
    await page.getByRole("button", { name: "Chiudi il benvenuto" }).click();
    await saved;
  }
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Operatore corrente")).toBeVisible();
  await expect(welcome).not.toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/system/status")).status)).toBe(403);
  expect(await page.evaluate(async () => (await fetch("/api/system/backups", { method: "POST" })).status)).toBe(403);
  await clerk.signOut({ page });
  await expect(page.getByLabel("Operatore corrente")).not.toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/studies")).status)).toBe(401);
});

test("business profile UI shows full name and title separately from access permissions", async ({ page }) => {
  // Only presentation data is stubbed: sign-in still uses the real staging operator.
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    const profile = await response.json();
    await route.fulfill({ response, json: { ...profile, firstName: "Daniele", lastName: "Recchia",
      name: "Daniele Recchia", jobTitle: "Responsabile Tecnico" } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  const card = page.getByLabel("Operatore corrente");
  await expect(card.locator(".operator-name")).toHaveText("Daniele Recchia");
  await expect(card.locator(".operator-job-title")).toHaveText("Responsabile Tecnico");
  await expect(card.locator(".operator-access-role")).toHaveText("Accesso Operatore · Test");
  for (const selector of [".operator-name", ".operator-job-title"]) {
    await expect(card.locator(selector)).toBeVisible();
    expect(await card.locator(selector).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(async () => (await fetch("/api/system/status")).status)).toBe(403);
  await clerk.signOut({ page });
});
