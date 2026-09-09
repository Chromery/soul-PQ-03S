import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("search shortcut stays on one line and focuses search across viewport sizes", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
  try {
    await expect(page.getByLabel("Operatore corrente")).toBeVisible();
    const search = page.getByRole("textbox", { name: "Cerca aziende, immobili o studi" });
    const hint = page.locator(".search-shortcut");
    for (const width of [1440, 1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(hint).toBeVisible();
      const boxes = await page.locator(".search-shortcut kbd").evaluateAll((keys) =>
        keys.map((key) => {
          const rect = key.getBoundingClientRect();
          return { top: rect.top, height: rect.height, right: rect.right };
        }),
      );
      expect(boxes).toHaveLength(2);
      expect(boxes[0].top).toBe(boxes[1].top);
      expect(boxes[0].height).toBe(24);
      const field = await page.locator(".global-search").boundingBox();
      expect(boxes[1].right).toBeLessThanOrEqual(field!.x + field!.width);
      expect((await search.boundingBox())!.width).toBeGreaterThan(60);
      if (width === 1280 && process.env.E2E_SEARCH_SCREENSHOT_PATH) {
        await page.locator(".global-search").screenshot({ path: process.env.E2E_SEARCH_SCREENSHOT_PATH });
      }
      await search.blur();
      await page.keyboard.press("Control+k");
      await expect(search).toBeFocused();
      await search.blur();
      await page.keyboard.press("Meta+k");
      await expect(search).toBeFocused();
    }
  await expect(page.getByLabel("Versione deploy 1.0.7")).toBeVisible();
  } finally {
    await clerk.signOut({ page });
  }
});
