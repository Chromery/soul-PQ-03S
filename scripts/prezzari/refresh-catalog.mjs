// Rebuild and audit while extraction progresses. An incomplete audit never makes
// a rule applicable, and must not prevent publishing other completed checks.
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
const rounds = Math.max(1, Number(process.env.PRICE_REFRESH_ROUNDS || 1));
const deadline = process.env.PRICE_DEADLINE
  ? Date.parse(process.env.PRICE_DEADLINE)
  : Infinity;
for (let round = 0; round < rounds && Date.now() < deadline; round++) {
  for (const script of [
    "build-catalog.mjs",
    "audit-rules.mjs",
    "build-catalog.mjs",
  ]) {
    const result = spawnSync(process.execPath, ["scripts/prezzari/" + script], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.signal || (result.status && script !== "audit-rules.mjs"))
      process.exit(1);
    if (result.status)
      console.log(
        JSON.stringify({
          auditIncomplete: true,
          message:
            "Le verifiche incomplete restano bloccate e saranno riprese nel prossimo ciclo.",
        }),
      );
  }
  if (round + 1 < rounds && Date.now() < deadline)
    await setTimeout(Math.min(45000, deadline - Date.now()));
}
