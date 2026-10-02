import { readFileSync, statSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Read-only configuration check. Never prints configuration values or secrets.
export function checkDeployment(env) {
  const failures = [], warnings = [];
  const require = (condition, label) => { if (!condition) failures.push(label); };
  const configured = key => !!env[key]?.trim() && !/REPLACE_|CHANGE_ME/.test(env[key]);
  require(["production", "staging"].includes(env.APP_ENV), "APP_ENV deve essere production o staging");
  const type = env.APP_ENV === "production" ? "live" : "test";
  for (const [key, prefix] of [["CLERK_SECRET_KEY", "sk_"], ["VITE_CLERK_PUBLISHABLE_KEY", "pk_"]])
    require(configured(key) && env[key].startsWith(prefix + type + "_"), key + ": chiave dell'ambiente richiesta");
  for (const key of ["CLERK_AUTHORIZED_PARTIES", "CORS_ORIGIN"])
    require(configured(key) && env[key].split(",").every(v => /^https:\/\/[^/\s]+$/.test(v.trim())), key + ": usare origini HTTPS esplicite");
  require(configured("ERP_SYNC_TOKEN") && env.ERP_SYNC_TOKEN.length >= 32, "ERP_SYNC_TOKEN: segreto dedicato di almeno 32 caratteri");
  require(configured("POSTGRES_PASSWORD") && env.POSTGRES_PASSWORD.length >= 24 && env.POSTGRES_PASSWORD !== "soul_dev_password", "POSTGRES_PASSWORD: password casuale di almeno 24 caratteri");
  try {
    const db = new URL(env.DATABASE_URL_DOCKER);
    require(db.hostname === "postgres", "DATABASE_URL_DOCKER: host deve essere il servizio postgres");
    require(decodeURIComponent(db.password) === env.POSTGRES_PASSWORD, "Password DB e DATABASE_URL_DOCKER non coerenti");
  } catch { failures.push("DATABASE_URL_DOCKER non valido"); }
  for (const key of ["DB_PORT", "API_PORT", "WEB_PORT"])
    require(/^127\.0\.0\.1:\d+$/.test(env[key] ?? ""), key + ": pubblicare solo su loopback dietro tunnel/proxy TLS");
  for (const key of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_KEY_PREFIX", "BACKUP_REMOTE_PREFIX", "NEURALWATT_API_KEY"])
    require(configured(key), key + ": configurazione richiesta");
  if (env.APP_ENV === "staging") {
    require(env.S3_KEY_PREFIX?.startsWith("staging"), "Staging: namespace documenti dedicato richiesto");
    require(env.BACKUP_REMOTE_PREFIX?.startsWith("staging/"), "Staging: namespace backup dedicato richiesto");
    if (!env.PQ_AUTOMATION_SECRET || env.PQ_AUTOMATION_SECRET.length < 32) warnings.push("Automazione disabilitata: PQ_AUTOMATION_SECRET mancante");
  } else require(!env.PQ_AUTOMATION_SECRET, "La produzione non deve avere il segreto di automazione");
  return { failures, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envFile = path.resolve(process.argv[2] ?? ".env");
  const env = parseEnv(readFileSync(envFile, "utf8"));
  const result = checkDeployment(env);
  if ((statSync(envFile).mode & 0o077) !== 0) result.failures.push("File env leggibile da altri utenti: applicare chmod 600");
  const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
  if (!existsSync(path.join(root, "00_prezzari2026/Milano.pdf"))) result.failures.push("Originali 00_prezzari2026 mancanti: non sono inclusi in Git");
  console.log(JSON.stringify({ ok: result.failures.length === 0, ...result }, null, 2));
  process.exitCode = result.failures.length ? 1 : 0;
}
