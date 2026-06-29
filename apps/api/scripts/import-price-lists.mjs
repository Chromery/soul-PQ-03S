import dotenv from "dotenv";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
process.env.DATABASE_URL ??= localDatabaseUrl();

const { Pool } = pg;
const SOURCE_DIR = process.env.PRICE_LIST_SOURCE_DIR ?? "00_prezzari2026";
const DOC_EXTENSIONS = new Set([".pdf", ".xlsx", ".txt"]);
const EXCLUDED_PATTERNS = [/thumbs\.db$/i, /^._/, /docfa esempio/i, /relazioni di calcolo/i];

const TERRITORIES = [
  territory("Milano", "PROVINCIA", "MI", "Lombardia", 45.4642, 9.19, ["milano"]),
  territory("Bergamo", "PROVINCIA", "BG", "Lombardia", 45.6983, 9.6773, ["bergamo", "bg"]),
  territory("Brescia", "PROVINCIA", "BS", "Lombardia", 45.5416, 10.2118, ["brescia", "bs"]),
  territory("Como", "PROVINCIA", "CO", "Lombardia", 45.8081, 9.0852, ["como", "co"]),
  territory("Lecco", "PROVINCIA", "LC", "Lombardia", 45.8566, 9.3977, ["lecco"]),
  territory("Lodi", "PROVINCIA", "LO", "Lombardia", 45.3097, 9.5037, ["lodi"]),
  territory("Mantova", "PROVINCIA", "MN", "Lombardia", 45.1564, 10.7914, ["mantova"]),
  territory("Pavia", "PROVINCIA", "PV", "Lombardia", 45.1847, 9.1582, ["pavia", "pv"]),
  territory("Sondrio", "PROVINCIA", "SO", "Lombardia", 46.1699, 9.8788, ["sondrio"]),
  territory("Varese", "PROVINCIA", "VA", "Lombardia", 45.8206, 8.8251, ["varese"]),
  territory("Piemonte", "REGIONE", null, "Piemonte", 45.0522, 7.5154, ["piemonte", "regione piemonte"]),
  territory("Alessandria", "PROVINCIA", "AL", "Piemonte", 44.9125, 8.6189, ["alessandria"]),
  territory("Cuneo", "PROVINCIA", "CN", "Piemonte", 44.3845, 7.5427, ["cuneo"]),
  territory("Novara", "PROVINCIA", "NO", "Piemonte", 45.4459, 8.6222, ["novara"]),
  territory("Veneto", "REGIONE", null, "Veneto", 45.4415, 11.861, ["veneto"]),
  territory("Belluno", "PROVINCIA", "BL", "Veneto", 46.1425, 12.2167, ["belluno", "bl 2021"]),
  territory("Padova", "PROVINCIA", "PD", "Veneto", 45.4064, 11.8768, ["padova", "pd 2021"]),
  territory("Rovigo", "PROVINCIA", "RO", "Veneto", 45.0698, 11.7902, ["rovigo"]),
  territory("Treviso", "PROVINCIA", "TV", "Veneto", 45.6669, 12.243, ["treviso", "tv 2021"]),
  territory("Venezia", "PROVINCIA", "VE", "Veneto", 45.4408, 12.3155, ["venezia", " ve 2020"]),
  territory("Verona", "PROVINCIA", "VR", "Veneto", 45.4384, 10.9916, ["verona", "vr 2021"]),
  territory("Vicenza", "PROVINCIA", "VI", "Veneto", 45.5455, 11.5354, ["vicenza", "vi 2011"]),
  territory("Friuli Venezia Giulia", "REGIONE", null, "Friuli Venezia Giulia", 45.9457, 13.1408, ["friuli", "fvg"]),
  territory("Gorizia", "PROVINCIA", "GO", "Friuli Venezia Giulia", 45.9409, 13.6217, ["fvg go", "gorizia"]),
  territory("Pordenone", "PROVINCIA", "PN", "Friuli Venezia Giulia", 45.9569, 12.6605, ["pordenone"]),
  territory("Trieste", "PROVINCIA", "TS", "Friuli Venezia Giulia", 45.6495, 13.7768, ["trieste"]),
  territory("Udine", "PROVINCIA", "UD", "Friuli Venezia Giulia", 46.0711, 13.2346, ["udine"]),
  territory("Emilia-Romagna", "REGIONE", null, "Emilia-Romagna", 44.4949, 11.3426, ["emilia romagna"]),
  territory("Bologna", "PROVINCIA", "BO", "Emilia-Romagna", 44.4949, 11.3426, ["bologna", "bo"]),
  territory("Ferrara", "PROVINCIA", "FE", "Emilia-Romagna", 44.8381, 11.6198, ["ferrara"]),
  territory("Modena", "PROVINCIA", "MO", "Emilia-Romagna", 44.6471, 10.9252, ["modena"]),
  territory("Parma", "PROVINCIA", "PR", "Emilia-Romagna", 44.8015, 10.3279, ["parma"]),
  territory("Reggio Emilia", "PROVINCIA", "RE", "Emilia-Romagna", 44.6983, 10.6312, ["reggio emilia"]),
  territory("Toscana", "REGIONE", null, "Toscana", 43.7711, 11.2486, ["toscana"]),
  territory("Arezzo", "PROVINCIA", "AR", "Toscana", 43.4633, 11.8796, ["arezzo"]),
  territory("Firenze", "PROVINCIA", "FI", "Toscana", 43.7696, 11.2558, ["firenze"]),
  territory("Grosseto", "PROVINCIA", "GR", "Toscana", 42.7635, 11.1124, ["grosseto"]),
  territory("Livorno", "PROVINCIA", "LI", "Toscana", 43.5485, 10.3106, ["livorno"]),
  territory("Lucca", "PROVINCIA", "LU", "Toscana", 43.8429, 10.5027, ["lucca"]),
  territory("Massa-Carrara", "PROVINCIA", "MS", "Toscana", 44.0354, 10.1396, ["massa", "massa carrara"]),
  territory("Pisa", "PROVINCIA", "PI", "Toscana", 43.7228, 10.4017, ["pisa"]),
  territory("Pistoia", "PROVINCIA", "PT", "Toscana", 43.9335, 10.9173, ["pistoia"]),
  territory("Prato", "PROVINCIA", "PO", "Toscana", 43.8777, 11.1022, ["prato"]),
  territory("Siena", "PROVINCIA", "SI", "Toscana", 43.3188, 11.3308, ["siena"]),
  territory("Marche", "REGIONE", null, "Marche", 43.6168, 13.5189, ["marche"]),
  territory("Ancona", "PROVINCIA", "AN", "Marche", 43.6158, 13.5189, ["ancona"]),
  territory("Ascoli Piceno", "PROVINCIA", "AP", "Marche", 42.8536, 13.5749, ["ascoli piceno"]),
  territory("Macerata", "PROVINCIA", "MC", "Marche", 43.2987, 13.4535, ["macerata"]),
  territory("Pesaro e Urbino", "PROVINCIA", "PU", "Marche", 43.9125, 12.9155, ["pesaro"]),
  territory("Umbria", "REGIONE", null, "Umbria", 43.1107, 12.3892, ["umbria"]),
  territory("Perugia", "PROVINCIA", "PG", "Umbria", 43.1107, 12.3892, ["perugia"]),
  territory("Terni", "PROVINCIA", "TR", "Umbria", 42.5636, 12.6427, ["terni"]),
  territory("Lazio", "REGIONE", null, "Lazio", 41.8928, 12.4837, ["lazio"]),
  territory("Latina", "PROVINCIA", "LT", "Lazio", 41.4676, 12.9037, ["latina"]),
  territory("Roma", "PROVINCIA", "RM", "Lazio", 41.9028, 12.4964, ["roma"]),
  territory("Abruzzo", "REGIONE", null, "Abruzzo", 42.192, 13.7289, ["abruzzo"]),
  territory("Teramo", "PROVINCIA", "TE", "Abruzzo", 42.6612, 13.699, ["teramo"]),
  territory("Molise", "REGIONE", null, "Molise", 41.5603, 14.6687, ["molise"]),
  territory("Campobasso", "PROVINCIA", "CB", "Molise", 41.5603, 14.6687, ["campobasso"]),
  territory("Campania", "REGIONE", null, "Campania", 40.8396, 14.2508, ["campania"]),
  territory("Caserta", "PROVINCIA", "CE", "Campania", 41.0747, 14.3324, ["caserta"]),
  territory("Napoli", "PROVINCIA", "NA", "Campania", 40.8518, 14.2681, ["napoli"]),
  territory("Puglia", "REGIONE", null, "Puglia", 41.1256, 16.8667, ["puglia"]),
  territory("Bari", "PROVINCIA", "BA", "Puglia", 41.1171, 16.8719, ["bari"]),
  territory("Basilicata", "REGIONE", null, "Basilicata", 40.6395, 15.8051, ["basilicata"]),
  territory("Matera", "PROVINCIA", "MT", "Basilicata", 40.6664, 16.6043, ["matera"]),
  territory("Potenza", "PROVINCIA", "PZ", "Basilicata", 40.6395, 15.8051, ["potenza"]),
  territory("Calabria", "REGIONE", null, "Calabria", 38.9059, 16.5944, ["calabria"]),
  territory("Reggio Calabria", "PROVINCIA", "RC", "Calabria", 38.1113, 15.6473, ["reggio calabria"]),
  territory("Sicilia", "REGIONE", null, "Sicilia", 37.599, 14.0154, ["sicilia"]),
  territory("Agrigento", "PROVINCIA", "AG", "Sicilia", 37.3111, 13.5765, ["agrigento"]),
  territory("Caltanissetta", "PROVINCIA", "CL", "Sicilia", 37.4901, 14.0629, ["caltanisetta", "caltanissetta"]),
  territory("Catania", "PROVINCIA", "CT", "Sicilia", 37.5079, 15.083, ["catania"]),
  territory("Messina", "PROVINCIA", "ME", "Sicilia", 38.1938, 15.554, ["messina"]),
  territory("Palermo", "PROVINCIA", "PA", "Sicilia", 38.1157, 13.3615, ["palermo"]),
  territory("Siracusa", "PROVINCIA", "SR", "Sicilia", 37.0755, 15.2866, ["siracusa"]),
  territory("Sardegna", "REGIONE", null, "Sardegna", 40.1209, 9.0129, ["sardegna"]),
  territory("Cagliari", "PROVINCIA", "CA", "Sardegna", 39.2238, 9.1217, ["cagliari"]),
  territory("Sassari", "PROVINCIA", "SS", "Sardegna", 40.7259, 8.5557, ["sassari"]),
  territory("Trentino-Alto Adige", "REGIONE", null, "Trentino-Alto Adige", 46.4983, 11.3548, ["trentino alto adige"]),
  territory("Bolzano", "PROVINCIA", "BZ", "Trentino-Alto Adige", 46.4983, 11.3548, ["bolzano"]),
  territory("Liguria", "REGIONE", null, "Liguria", 44.4115, 8.9327, ["liguria"]),
  territory("Genova", "PROVINCIA", "GE", "Liguria", 44.4056, 8.9463, ["genova"]),
  territory("Savona", "PROVINCIA", "SV", "Liguria", 44.309, 8.4772, ["savona"]),
];

const PROVINCE_REGIONS = Object.fromEntries(
  TERRITORIES.filter((item) => item.provincia).map((item) => [item.provincia, item.region]),
);
const CITY_TERRITORIES = Object.fromEntries(
  TERRITORIES.filter((item) => item.scope === "PROVINCIA").map((item) => [normalize(item.name), item]),
);
const CITY_COORDS = Object.fromEntries(
  TERRITORIES.filter((item) => item.scope === "PROVINCIA").map((item) => [normalize(item.name), { lat: item.lat, lon: item.lon }]),
);
const REGION_COORDS = Object.fromEntries(
  TERRITORIES.filter((item) => item.scope === "REGIONE").map((item) => [normalize(item.region), { lat: item.lat, lon: item.lon }]),
);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const files = await collectFiles(SOURCE_DIR);
  const documents = files.map((file) => ({ ...file, territory: inferTerritory(file.relativePath) }));
  const s3 = createS3();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://soul:soul_dev_password@localhost:5432/soul_pq?schema=public" });
  const imported = [];
  try {
    for (const document of documents) {
      const body = await readFile(document.absolutePath);
      const sha256 = createHash("sha256").update(body).digest("hex");
      const storageKey = path.posix.join(
        "prezzari",
        safePathPart(document.territory.scope.toLowerCase()),
        safePathPart(document.territory.name),
        `${sha256.slice(0, 12)}-${safeFile(document.fileName)}`,
      );
      const mimeType = contentType(document.fileName);
      await s3.send(new PutObjectCommand({
        Bucket: requiredEnv("S3_BUCKET"),
        Key: storageKey,
        Body: body,
        ContentType: mimeType,
        ContentLength: body.byteLength,
        Metadata: { sha256, file_name: document.fileName },
      }));
      const priceList = {
        id: randomUUID(),
        title: titleFor(document),
        fileName: document.fileName,
        storageKey,
        mimeType,
        sha256,
        sizeBytes: body.byteLength,
        sourcePath: document.relativePath,
        territoryName: document.territory.name,
        territoryScope: document.territory.scope,
        comune: document.territory.scope === "COMUNE" ? document.territory.name : null,
        provincia: document.territory.provincia,
        region: document.territory.region,
        year: inferYear(document.relativePath),
        latitude: document.territory.lat,
        longitude: document.territory.lon,
        priority: priorityFor(document.relativePath),
      };
      const result = await upsertPriceList(pool, priceList);
      imported.push({ ...priceList, id: result.id });
      console.log(`${priceList.territoryName} | ${priceList.fileName} | ${storageKey}`);
    }
    await assignPriceLists(pool);
    await writeCatalog(imported);
    console.log(`Importati ${imported.length} prezzari/documenti territoriali.`);
  } finally {
    await pool.end();
  }
}

async function collectFiles(root) {
  const result = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "__MACOSX" || entry.name.startsWith("._")) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      const relativePath = path.relative(root, fullPath).replaceAll(path.sep, "/");
      if (!DOC_EXTENSIONS.has(ext)) continue;
      if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(relativePath))) continue;
      result.push({ absolutePath: fullPath, relativePath, fileName: entry.name });
    }
  }
  await walk(root);
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function inferTerritory(relativePath) {
  const normalizedPath = normalize(relativePath);
  const found = TERRITORIES
    .flatMap((territory) => territory.aliases.map((alias) => ({ territory, alias: normalize(alias) })))
    .filter(({ alias }) => normalizedPath.includes(alias))
    .sort((a, b) => b.alias.length - a.alias.length)[0]?.territory;
  return found ?? territory("Territorio non riconosciuto", "NAZIONALE", null, "", 42.5, 12.5, []);
}

function titleFor(document) {
  return document.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function inferYear(value) {
  const years = [...value.matchAll(/(?:19|20)\d{2}/g)].map((match) => Number(match[0]));
  return years.length ? Math.max(...years) : null;
}

function priorityFor(value) {
  const normalized = normalize(value);
  if (normalized.includes("prontuario") || normalized.includes("prezzario") || normalized.includes("prezziario")) return 40;
  if (normalized.includes("allegato") || normalized.includes("appendice")) return -20;
  if (normalized.includes("vecchio")) return -40;
  return 0;
}

async function upsertPriceList(pool, priceList) {
  const values = [
    priceList.id,
    priceList.title,
    priceList.fileName,
    priceList.storageKey,
    priceList.mimeType,
    priceList.sha256,
    priceList.sizeBytes,
    priceList.sourcePath,
    priceList.territoryName,
    priceList.territoryScope,
    priceList.comune,
    priceList.provincia,
    priceList.region,
    priceList.year,
    priceList.latitude,
    priceList.longitude,
    priceList.priority,
  ];
  const { rows } = await pool.query(
    `INSERT INTO "PriceList" (
      "id", "title", "fileName", "storageKey", "mimeType", "sha256", "sizeBytes", "sourcePath",
      "territoryName", "territoryScope", "comune", "provincia", "region", "year", "latitude", "longitude", "priority", "updatedAt"
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
    ON CONFLICT ("storageKey") DO UPDATE SET
      "title" = EXCLUDED."title",
      "fileName" = EXCLUDED."fileName",
      "mimeType" = EXCLUDED."mimeType",
      "sha256" = EXCLUDED."sha256",
      "sizeBytes" = EXCLUDED."sizeBytes",
      "sourcePath" = EXCLUDED."sourcePath",
      "territoryName" = EXCLUDED."territoryName",
      "territoryScope" = EXCLUDED."territoryScope",
      "comune" = EXCLUDED."comune",
      "provincia" = EXCLUDED."provincia",
      "region" = EXCLUDED."region",
      "year" = EXCLUDED."year",
      "latitude" = EXCLUDED."latitude",
      "longitude" = EXCLUDED."longitude",
      "priority" = EXCLUDED."priority",
      "updatedAt" = now()
    RETURNING "id"`,
    values,
  );
  return rows[0];
}

async function assignPriceLists(pool) {
  const { rows: priceLists } = await pool.query(`SELECT * FROM "PriceList"`);
  const { rows: properties } = await pool.query(
    `SELECT p."id", p."address", p."comune", s."provincia", s."region"
     FROM "Property" p
     JOIN "FeasibilityStudy" s ON s."id" = p."studyId"`,
  );
  await pool.query(`DELETE FROM "PropertyPriceList"`);
  for (const property of properties) {
    const ranked = rankForProperty(property, priceLists).slice(0, 5);
    for (const [index, match] of ranked.entries()) {
      await pool.query(
        `INSERT INTO "PropertyPriceList" ("id", "propertyId", "priceListId", "rank", "score", "reason", "distanceKm", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
        [randomUUID(), property.id, match.priceList.id, index + 1, match.score, match.reason, match.distanceKm],
      );
    }
  }
  console.log(`Associazioni aggiornate per ${properties.length} immobili.`);
}

function rankForProperty(property, priceLists) {
  const target = territoryForProperty(property);
  return priceLists
    .map((priceList) => {
      let score = 0;
      let reason = "";
      let distanceKm = null;
      if (normalize(priceList.comune) === target.comune && target.comune) {
        score = 10000;
        reason = "Comune corrispondente";
      } else if (normalize(priceList.provincia) === target.provincia && target.provincia) {
        score = 8000;
        reason = "Provincia corrispondente";
      } else if (normalize(priceList.region) === target.region && target.region) {
        score = 6000;
        reason = "Regione corrispondente";
      } else if (target.coords && priceList.latitude !== null && priceList.longitude !== null) {
        distanceKm = haversineKm(target.coords, { lat: Number(priceList.latitude), lon: Number(priceList.longitude) });
        score = Math.max(0, 3000 - distanceKm * 12);
        reason = "Territorio piu vicino";
      }
      if (!score) return null;
      if (priceList.year) score += Math.min(80, Math.max(0, Number(priceList.year) - 1990));
      score += Number(priceList.priority ?? 0);
      return { priceList, score, reason, distanceKm };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

function territoryForProperty(property) {
  const comune = normalize(property.comune);
  const cityTerritory = CITY_TERRITORIES[comune];
  const addressProvince = provinceCodeFromAddress(property.address);
  const provinceCode = cityTerritory?.provincia || addressProvince || normalizeProvinceCode(property.provincia);
  const regionName = cityTerritory?.region || PROVINCE_REGIONS[provinceCode] || property.region;
  const region = normalize(regionName);
  return {
    comune,
    provincia: normalize(provinceCode),
    region,
    coords: cityTerritory
      ? { lat: cityTerritory.lat, lon: cityTerritory.lon }
      : CITY_COORDS[comune] ?? REGION_COORDS[region],
  };
}

function provinceCodeFromAddress(address) {
  const match = String(address ?? "").trim().match(/(?:^|[\s,(])([A-Z]{2})(?:[\s).,]*)$/);
  return match ? match[1] : "";
}

function normalizeProvinceCode(value) {
  const code = normalize(value).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

async function writeCatalog(imported) {
  const lines = [
    "# Catalogo Prezzari Importati",
    "",
    "Catalogo generato da `npm run prezzari:import`. Lo zip e la cartella estratta restano locali e ignorati da Git.",
    "",
    "| Territorio | Scope | Regione | File | Anno | Dimensione |",
    "|---|---|---|---|---:|---:|",
  ];
  imported
    .sort((a, b) => `${a.region ?? ""}${a.territoryName}${a.fileName}`.localeCompare(`${b.region ?? ""}${b.territoryName}${b.fileName}`))
    .forEach((item) => {
      lines.push(`| ${item.territoryName} | ${item.territoryScope} | ${item.region ?? ""} | ${item.fileName} | ${item.year ?? ""} | ${item.sizeBytes} |`);
    });
  await writeFile("docs/prezzari-territoriali-catalog.md", `${lines.join("\n")}\n`);
}

function createS3() {
  return new S3Client({
    endpoint: requiredEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION || "us-west-004",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
}

function territory(name, scope, provincia, region, lat, lon, aliases) {
  return { name, scope, provincia, region, lat, lon, aliases: [name, provincia, ...aliases].filter(Boolean) };
}

function contentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function safePathPart(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function safeFile(value) {
  return safePathPart(path.basename(String(value).trim()) || "prezzario");
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function haversineKm(a, b) {
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(value));
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.includes("REPLACE_")) throw new Error(`${name} non configurato`);
  return value;
}

function localDatabaseUrl() {
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? "soul");
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "soul_dev_password");
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  const database = process.env.POSTGRES_DB ?? "soul_pq";
  return `postgresql://${user}:${password}@${host}:${port}/${database}?schema=public`;
}
