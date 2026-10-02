// Explicit, additive staging fixture import. Production is opened READ ONLY.
// Dry run: node scripts/copy-production-studies-to-staging.mjs --batch 20261002 --studies 4631,4632
// Add --apply after reviewing the counts. Requires local Docker access and a staging DB backup.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const SOURCE = "soul-prospect-qualifier";
const TARGET = "soul-pq-staging";
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const inspect = name => JSON.parse(execFileSync("docker", ["inspect", name], { encoding: "utf8" }))[0];
const environment = container => Object.fromEntries(container.Config.Env.map(item => {
  const at = item.indexOf("="); return [item.slice(0, at), item.slice(at + 1)];
}));

export function rewriteFixtureJson(value, ids, key = "") {
  if (Array.isArray(value)) return value.map(item => rewriteFixtureJson(item, ids, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .map(([field, item]) => [field, rewriteFixtureJson(item, ids, field)]));
  if (typeof value !== "string") return value;
  if (/ids?$/i.test(key) && ids.has(value)) return ids.get(value);
  if (key === "url" || key.endsWith("Url")) {
    const url = value.replace(/^https:\/\/pq-soul\.rainailab\.com(?=\/)/, "");
    return url.replace(/(\/api\/(?:properties|studies|property-valuation-groups)\/)([^/?#]+)/g,
      (_, prefix, id) => prefix + (ids.get(decodeURIComponent(id)) ?? id));
  }
  return value;
}

function connect(project, readonly) {
  const api = inspect(`${project}-api-1`), db = inspect(`${project}-postgres-1`), env = environment(api);
  if (api.Config.Labels["com.docker.compose.project"] !== project || db.Config.Labels["com.docker.compose.project"] !== project)
    throw new Error("Unexpected Compose project");
  if (env.APP_ENV !== (readonly ? "production" : "staging")) throw new Error("Unexpected application environment");
  if (!readonly && !env.CLERK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("Staging must use Clerk test credentials");
  const port = db.NetworkSettings.Ports["5432/tcp"][0];
  if (port.HostPort !== (readonly ? "5432" : "5433") || port.HostIp !== "127.0.0.1") throw new Error("Unexpected DB binding");
  const url = new URL(env.DATABASE_URL); url.hostname = "127.0.0.1"; url.port = port.HostPort;
  url.searchParams.delete("schema"); url.searchParams.delete("options");
  const client = new pg.Client({ connectionString: url.toString(),
    options: `-c timezone=UTC -c default_transaction_read_only=${readonly ? "on" : "off"}` });
  return { client, env };
}

function storage(env) {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) throw new Error("Storage not configured");
  return new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } });
}

export async function run(args = process.argv.slice(2)) {
  const option = name => args[args.indexOf(name) + 1];
  const batch = args.includes("--batch") ? option("--batch") : "";
  const studyIds = args.includes("--studies") ? [...new Set(option("--studies").split(","))] : [];
  if (!/^[0-9]{8}[a-z0-9-]{0,20}$/.test(batch) || !studyIds.length || studyIds.length > 25 || studyIds.some(id => !/^\d+$/.test(id)))
    throw new Error("Provide --batch YYYYMMDD[-suffix] and --studies ID,ID (1–25 numeric production IDs)");
  const apply = args.includes("--apply"), prefix = `sample-${batch}-`;
  const source = connect(SOURCE, true), target = connect(TARGET, false);
  let sourceStorage, targetStorage;
  await source.client.connect(); await target.client.connect();
  try {
    await source.client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const data = {};
    const read = async (table, where, values = [studyIds]) => {
      data[table] = (await source.client.query(`SELECT * FROM ${quote(table)} WHERE ${where}`, values)).rows;
    };
    await read("FeasibilityStudy", 'id = ANY($1::text[])');
    if (data.FeasibilityStudy.length !== studyIds.length) throw new Error("Some requested source studies do not exist");
    await read("StudyVersion", '"studyId" = ANY($1::text[])');
    await read("PropertyValuationGroup", '"studyId" = ANY($1::text[])');
    await read("Property", '"studyId" = ANY($1::text[])');
    const propertyIds = data.Property.map(p => p.id);
    await read("PropertyDocument", '"propertyId" = ANY($1::text[])', [propertyIds]);
    await read("PlanAnalysisDraft", '"propertyId" = ANY($1::text[])', [propertyIds]);
    await read("PropertyValuationGroupAnalysisDraft", '"valuationGroupId" = ANY($1::text[])', [data.PropertyValuationGroup.map(g => g.id)]);
    // Populate the previously empty legacy price-list panel too; independent files.
    await read("PriceList", "true", []);
    await read("PropertyPriceList", '"propertyId" = ANY($1::text[])', [propertyIds]);
    await source.client.query("COMMIT");

    const ids = new Map();
    for (const [table, rows] of Object.entries(data)) for (const row of rows) {
      if (ids.has(row.id)) throw new Error("Ambiguous source ID across tables");
      ids.set(row.id, `${prefix}${table.toLowerCase()}-${row.id}`);
    }
    const existingPrices = (await target.client.query('SELECT id, sha256 FROM "PriceList"')).rows;
    for (const row of data.PriceList) {
      const existing = existingPrices.find(price => price.sha256 === row.sha256);
      if (existing) ids.set(row.id, existing.id);
    }
    data.PriceList = data.PriceList.filter(row => ids.get(row.id).startsWith(prefix));
    // Refuse to overwrite or refresh an earlier import, including its operator edits.
    for (const [table, rows] of Object.entries(data)) {
      const found = await target.client.query(`SELECT count(*) FROM ${quote(table)} WHERE id = ANY($1::text[])`, [rows.map(row => ids.get(row.id))]);
      if (Number(found.rows[0].count)) throw new Error(`Target collision in ${table}; use another batch, never overwrite`);
    }
    const totals = Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length]));
    const documents = [...data.PropertyDocument, ...data.PriceList];
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", batch, totals,
      attachmentBytes: documents.reduce((sum, row) => sum + (row.sizeBytes || 0), 0),
      provinces: [...new Set(data.Property.map(p => p.provincia).filter(Boolean))].sort(),
      studies: data.FeasibilityStudy.map(s => ({ source: s.id, target: ids.get(s.id), company: s.company.trim() })) }, null, 2));
    if (!apply) return;

    sourceStorage = storage(source.env); targetStorage = storage(target.env);
    const keys = new Map();
    for (const [index, doc] of documents.entries()) {
      const result = await sourceStorage.send(new GetObjectCommand({ Bucket: source.env.S3_BUCKET, Key: doc.storageKey }));
      const body = Buffer.from(await result.Body.transformToByteArray());
      const hash = createHash("sha256").update(body).digest("hex");
      if (doc.sha256 && hash !== doc.sha256) throw new Error(`Source checksum mismatch for ${doc.id}`);
      if (doc.sizeBytes != null && body.length !== doc.sizeBytes) throw new Error(`Source size mismatch for ${doc.id}`);
      const key = `staging/samples/${batch}/${ids.get(doc.id)}/${hash}-${doc.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      if (key === doc.storageKey || !key.startsWith(`staging/samples/${batch}/`)) throw new Error("Unsafe storage destination");
      let existing;
      try { existing = await targetStorage.send(new HeadObjectCommand({ Bucket: target.env.S3_BUCKET, Key: key })); }
      catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
      if (existing && (existing.Metadata?.sha256 !== hash || existing.ContentLength !== body.length)) throw new Error("Destination object collision");
      if (!existing) await targetStorage.send(new PutObjectCommand({ Bucket: target.env.S3_BUCKET, Key: key, Body: body,
        ContentType: doc.mimeType, Metadata: { sha256: hash, fixture_batch: batch } }));
      const verified = await targetStorage.send(new HeadObjectCommand({ Bucket: target.env.S3_BUCKET, Key: key }));
      if (verified.Metadata?.sha256 !== hash || verified.ContentLength !== body.length) throw new Error("Destination verification failed");
      keys.set(doc.id, key);
      if ((index + 1) % 25 === 0 || index + 1 === documents.length) console.log(`Independent attachments verified: ${index + 1}/${documents.length}`);
    }

    // No sync jobs, invitations, audit logs, presentation history or personal settings
    // are copied. Existing staging data is preserved. All new rows commit atomically.
    await target.client.query("BEGIN");
    for (const table of ["FeasibilityStudy", "StudyVersion", "PropertyValuationGroup", "Property", "PropertyDocument",
      "PlanAnalysisDraft", "PropertyValuationGroupAnalysisDraft", "PriceList", "PropertyPriceList"]) {
      for (const sourceRow of data[table]) {
        const row = { ...sourceRow };
        for (const key of ["id", "studyId", "propertyId", "studyVersionId", "valuationGroupId", "priceListId"])
          if (row[key] != null) {
            if (!ids.has(row[key])) throw new Error(`Unmapped foreign key ${table}.${key}`);
            row[key] = ids.get(row[key]);
          }
        if (table === "FeasibilityStudy") Object.assign(row, { studyGroupId: null, companyErpId: null, erpUrl: null,
          company: `[TEST prezzari] ${sourceRow.company.trim()}`, isTest: false, importedAt: new Date(),
          sourceSyncId: `staging-sample-${batch}`, erpImportedAt: null, erpUpdatedAt: null,
          notes: `${sourceRow.notes}\n\nCopia isolata per test prezzari: studio produzione ${sourceRow.id}, lotto ${batch}. Non sincronizzare con ERP.` });
        if (table === "PropertyDocument") row.erpDocumentId = null;
        if ("storageKey" in row) row.storageKey = keys.get(sourceRow.id);
        // A future regular price-list import must not mistake the fixture for its original.
        if (table === "PriceList") row.sourcePath = `staging-samples/${batch}/${sourceRow.id}`;
        for (const key of ["documentSource", "payload"]) if (key in row)
          row[key] = JSON.stringify(rewriteFixtureJson(row[key], ids));
        const columns = Object.keys(row);
        await target.client.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row));
      }
    }
    await target.client.query("COMMIT");
    console.log(`Committed ${data.FeasibilityStudy.length} independent staging studies. Production was read-only.`);
  } catch (error) {
    await target.client.query("ROLLBACK").catch(() => {});
    // Never print DB connection strings or AWS SDK request objects.
    throw new Error(error.message);
  } finally {
    await source.client.end(); await target.client.end(); sourceStorage?.destroy(); targetStorage?.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
