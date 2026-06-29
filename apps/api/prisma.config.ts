import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
process.env.DATABASE_URL ??= localDatabaseUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

function localDatabaseUrl() {
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? "soul");
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "soul_dev_password");
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  const database = process.env.POSTGRES_DB ?? "soul_pq";
  return `postgresql://${user}:${password}@${host}:${port}/${database}?schema=public`;
}
