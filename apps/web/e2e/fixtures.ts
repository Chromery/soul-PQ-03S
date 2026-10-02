import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    const secret = process.env.PQ_AUTOMATION_SECRET;
    if (!secret || secret.length < 32 || baseURL !== "https://st-pq-soul.rainailab.com") {
      throw new Error("Credenziale di automazione staging mancante");
    }
    // HttpOnly, same-site and API-path scoped: never sent to Clerk or S3 and not
    // exposed to page JavaScript. Browser contexts and auth state are not saved.
    await context.addCookies([{ name: "__Secure-pq_automation", value: secret,
      domain: new URL(baseURL).hostname, path: "/api", httpOnly: true, secure: true, sameSite: "Strict" }]);
    await use(context);
  },
});
export { expect };
export { chromium } from "@playwright/test";
