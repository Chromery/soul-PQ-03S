import { clerkSetup } from "@clerk/testing/playwright";
export default async function setup() {
  if (process.env.APP_ENV !== "staging" || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
      !process.env.CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") || !process.env.E2E_CLERK_USER_EMAIL?.includes("+clerk_test@")) {
    throw new Error("Test consentiti solo con identita e chiavi dedicate allo staging.");
  }
  await clerkSetup();
}
