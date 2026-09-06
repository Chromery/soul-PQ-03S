import { createClerkClient } from "@clerk/backend";

// Explicit environment only; never load credentials from the production worktree.
if (process.env.APP_ENV !== "staging" || !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
  throw new Error("Questo comando richiede APP_ENV=staging e una chiave Clerk sk_test_ nel secret store.");
}
const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const mode = process.argv[2];
if (mode === "automation") {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email?.includes("+clerk_test@")) throw new Error("Imposta E2E_CLERK_USER_EMAIL con un indirizzo Clerk di test (+clerk_test@).");
  const existing = await client.users.getUserList({ emailAddress: [email] });
  if (existing.totalCount) {
    const pq = existing.data[0].privateMetadata.pq;
    if (!pq?.automation || pq.environment !== "staging" || pq.role !== "operator") throw new Error("Indirizzo gia assegnato a un account diverso: nessuna modifica effettuata.");
    console.log("Account automazione staging gia presente.");
  } else {
    await client.users.createUser({ emailAddress: [email], firstName: "PQ", lastName: "Test automatici",
      skipPasswordRequirement: true, privateMetadata: { pq: { environment: "staging", role: "operator", automation: true } } });
    console.log("Account operatore per test staging creato. Nessuna password condivisa: usare Clerk Testing.");
  }
} else if (mode === "grant") {
  const userId = process.env.PQ_CLERK_USER_ID;
  const role = process.env.PQ_CLERK_ROLE;
  if (!userId?.startsWith("user_") || !["admin", "operator"].includes(role)) throw new Error("Imposta PQ_CLERK_USER_ID e PQ_CLERK_ROLE (admin/operator).");
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.pq?.automation) throw new Error("Non modificare account di automazione con grant.");
  await client.users.updateUserMetadata(userId, { privateMetadata: { pq: { environment: "staging", role, automation: false } } });
  console.log("Ruolo staging assegnato. Applicazione entro 15 secondi.");
} else {
  throw new Error("Uso: clerk-staging-users.mjs automation|grant");
}
