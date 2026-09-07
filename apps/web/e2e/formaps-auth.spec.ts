import { test, expect, chromium } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("forMaps 0.65.0 relays through the signed-in PQ tab without exposing tokens", async () => {
  test.setTimeout(90_000);
  const profile = await mkdtemp(path.join(tmpdir(), "pq-extension-e2e-"));
  const extension = path.resolve("public/formaps-open/extension");
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true, ignoreDefaultArgs: ["--disable-extensions"],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const page = await context.newPage();
    const origin = "https://st-pq-soul.rainailab.com";
    // The old unauthenticated request is rejected BEFORE any inference is performed.
    expect((await context.request.post(`${origin}/api/qwen-captcha`, { data: {}, headers: { origin, "x-formaps-open-extension": "1" } })).status()).toBe(401);
    await page.goto(origin);
    await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
    await page.reload();
    await expect(page.getByLabel("Operatore corrente")).toBeVisible();
    // Exercise the real cookie-auth guard, but invalid input stops before NeuralWatt.
    const status = await page.evaluate(async () => (await fetch("/api/qwen-captcha", {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "x-formaps-open-extension": "1" }, body: "{}",
    })).status);
    expect(status).toBe(400);
    let relayed = 0;
    let cookiePresent = false;
    await context.route("**/api/qwen-captcha", async route => {
      relayed++;
      const headers = await route.request().allHeaders();
      cookiePresent = /(?:^|;\s*)__session=/.test(headers.cookie ?? "");
      expect(headers["x-formaps-open-extension"]).toBe("1");
      expect(route.request().postDataJSON()).toEqual({ imageDataUrl: "data:image/png;base64,fixture" });
      await route.fulfill({ json: { ok: true, result: { captchaCode: "FIXTURE", looksLikeCaptcha: true } } });
    });
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const result = await worker.evaluate(async () => {
      const api = (globalThis as any).chrome;
      const version = api.runtime.getManifest().version;
      const reply = await (globalThis as any).sendCaptchaToQwen("data:image/png;base64,fixture", {
        options: { qwenCaptchaEndpoint: "https://st-pq-soul.rainailab.com/api/qwen-captcha" },
      });
      return { version, reply };
    });
    expect(result.version).toBe("0.65.0");
    expect(result.reply.ok).toBe(true);
    expect(result.reply.response.result.captchaCode).toBe("FIXTURE");
    expect(relayed).toBe(1);
    expect(cookiePresent).toBe(true);
    // Staging session cannot silently fall back to production.
    const otherEnvironment = await worker.evaluate(async () => (globalThis as any).sendCaptchaToQwen("data:image/png;base64,fixture", {
      options: { qwenCaptchaEndpoint: "https://pq-soul.rainailab.com/api/qwen-captcha" },
    }));
    expect(otherEnvironment.ok).toBe(false);
    expect(relayed).toBe(1);
  } finally {
    await context.close();
    // Only this test's freshly created browser profile (including session cookies).
    await rm(profile, { recursive: true, force: true });
  }
});
