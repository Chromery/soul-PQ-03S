// Run only against a disposable PostgreSQL database, with the generated client.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { PrismaService } from "../dist/prisma/prisma.service.js";

const connectionString = process.env.OUTCOME_TEST_DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname !== "/pq_outcome_timestamp_test") {
  throw new Error("Only the disposable pq_outcome_timestamp_test database is allowed");
}
const pool = new Pool({ connectionString, options: "-c timezone=Pacific/Auckland" });
// Exercise the actual built service, including its per-connection UTC policy.
// A conflicting connection option must not leak a non-UTC timezone to Prisma.
const prismaUrl = new URL(connectionString);
prismaUrl.searchParams.set("options", "-c timezone=Pacific/Auckland");
const prisma = new PrismaService({ getOrThrow: () => prismaUrl.toString() } as never);
try {
  await pool.query(`CREATE TABLE "FeasibilityStudy" (
    id text PRIMARY KEY, status text NOT NULL, "concludedAt" date,
    "updatedAt" timestamp(3) NOT NULL DEFAULT now()
  );
  INSERT INTO "FeasibilityStudy" (id, status, "concludedAt")
  VALUES ('legacy', 'Positiva', '2026-09-23'), ('empty', 'Aperta', NULL);`);
  const migration = readFileSync(new URL("../prisma/migrations/20260923120000_study_outcome_timestamp/migration.sql", import.meta.url), "utf8");
  await pool.query(migration);
  assert.equal((await prisma.$queryRawUnsafe<Array<{ TimeZone: string }>>("SHOW TIME ZONE"))[0].TimeZone, "UTC");
  const select = { id: true, status: true, concludedAt: true };
  const legacy = await prisma.feasibilityStudy.findUniqueOrThrow({ where: { id: "legacy" }, select });
  assert.equal(legacy.concludedAt?.toISOString(), "2026-09-23T00:00:00.000Z");
  assert.equal((await prisma.feasibilityStudy.findUniqueOrThrow({ where: { id: "empty" }, select })).concludedAt, null);
  for (const value of ["2026-09-23T15:42:18.456+02:00", "2026-01-23T15:42:18.456+01:00", "2026-10-25T02:30:00+01:00"]) {
    const expected = new Date(value).toISOString();
    await prisma.feasibilityStudy.update({ where: { id: "empty" }, data: { status: "Positiva", concludedAt: new Date(value) }, select });
    const saved = await prisma.feasibilityStudy.findUniqueOrThrow({ where: { id: "empty" }, select });
    assert.equal(saved.concludedAt?.toISOString(), expected);
    assert.equal(JSON.parse(JSON.stringify(saved)).concludedAt, expected);
  }
  const type = await pool.query(`SELECT data_type, datetime_precision FROM information_schema.columns WHERE table_name='FeasibilityStudy' AND column_name='concludedAt'`);
  assert.equal(type.rows[0].data_type, "timestamp with time zone");
  assert.equal(type.rows[0].datetime_precision, 3);
  console.log("PASS: real PostgreSQL migration, legacy/null preservation and Prisma timestamp round-trips (summer/winter/DST, milliseconds).");
} finally {
  await prisma.onModuleDestroy();
  await pool.end();
}
