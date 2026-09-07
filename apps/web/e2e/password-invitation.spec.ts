import { randomBytes, randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

test("invitation password guidance matches Clerk and accepts a compliant password", async ({ page, request }) => {
  test.setTimeout(90_000);
  if (process.env.APP_ENV !== "staging" || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Password enrollment test is staging-only");
  }
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY!;
  const domain = Buffer.from(publishableKey.slice("pk_test_".length), "base64").toString().replace(/\$$/, "");
  const environment = await (await request.get(`https://${domain}/v1/environment`)).json();
  // Fail visibly if an admin changes Clerk's policy without updating the copy.
  expect(environment.user_settings.password_settings.min_length).toBe(15);
  expect(environment.user_settings.password_settings.disable_hibp).toBe(false);

  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const email = `pq-password-${randomUUID()}+clerk_test@example.com`;
  let allowlistId: string | undefined;
  let invitationId: string | undefined;
  try {
    allowlistId = (await client.allowlistIdentifiers.createAllowlistIdentifier({ identifier: email, notify: false })).id;
    const invitation = await client.invitations.createInvitation({ emailAddress: email, notify: false,
      redirectUrl: "https://st-pq-soul.rainailab.com/sign-up",
      publicMetadata: { pqInvitation: { environment: "staging", role: "operator", automation: true } },
    });
    invitationId = invitation.id;
    if (!invitation.url) throw new Error("Missing test invitation URL");
    const ticket = new URL(invitation.url).searchParams.get("ticket");
    if (!ticket) throw new Error("Missing test invitation ticket");
    await setupClerkTestingToken({ page });
    // Start at the documented application redirect. The testing helper expects
    // JSON FAPI responses and must not intercept the HTML /tickets/accept hop.
    // Never print the invitation URL, credentials, request bodies or tokens.
    await page.goto(`/sign-up?__clerk_ticket=${encodeURIComponent(ticket)}`)
      .catch(() => { throw new Error("Unable to open staging test invitation"); });
    const password = page.locator('input[name="password"]');
    await expect(password).toBeVisible();
    await expect(page.getByText(/La password deve avere almeno 15 caratteri\. Puoi usare/)).toBeVisible();
    for (const length of [8, 14]) {
      await password.fill(randomBytes(16).toString("hex").slice(0, length));
      await password.blur();
      await expect(page.locator("#error-password")).toHaveText(/^La password deve (avere|contenere) almeno 15 caratteri\.?$/);
      await expect(page.locator("#error-password")).toBeVisible();
      await expect(page.getByText(/almeno 8 caratteri/)).toHaveCount(0);
    }
    await password.fill(`A9!${randomBytes(12).toString("hex").slice(0, 12)}`);
    await password.blur();
    await expect(page.locator("#error-password")).not.toBeVisible();
    for (const [name, value] of [["firstName", "PQ"], ["lastName", "Password Test"]]) {
      const field = page.locator(`input[name="${name}"]`);
      if (await field.isVisible()) await field.fill(value);
    }
    await page.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(page.getByLabel("Operatore corrente")).toBeVisible({ timeout: 30_000 });
    const user = (await client.users.getUserList({ emailAddress: [email] })).data[0];
    expect(user.passwordEnabled).toBe(true);
    expect(user.publicMetadata.pqInvitation).toEqual({ environment: "staging", role: "operator", automation: true });
  } finally {
    const users = (await client.users.getUserList({ emailAddress: [email] })).data;
    for (const user of users) {
      // Exact randomized test address only; never remove an existing staff account.
      if (user.emailAddresses.some(address => address.emailAddress === email)) await client.users.deleteUser(user.id);
    }
    if (invitationId) {
      const pending = await client.invitations.getInvitationList({ status: "pending", query: email });
      if (pending.data.some(invitation => invitation.id === invitationId)) await client.invitations.revokeInvitation(invitationId);
    }
    if (allowlistId) await client.allowlistIdentifiers.deleteAllowlistIdentifier(allowlistId);
  }
});
