import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(
  SCRIPT_DIR,
  "../src/formaps-territories/formaps-territories.generated.json",
);
const WEB_PROVINCES_OUTPUT_PATH = path.resolve(
  SCRIPT_DIR,
  "../../web/src/formaps-provinces.generated.ts",
);
const BASE_URL = "https://www.formaps.it/WS/DatiCatastali/";
const CALLBACK = "__soulPqFormapsCatalog";
const CONCURRENCY = 4;

const provincesPayload = await fetchJsonp("GetProvinceCatastali", { term: "" });
const provinces = normalizeItems(provincesPayload, "province");
if (provinces.length < 90) {
  throw new Error(`Catalogo province forMaps incompleto: ${provinces.length} elementi`);
}

let completed = 0;
const catalogProvinces = await mapLimit(provinces, CONCURRENCY, async (province) => {
  const comuniPayload = await fetchJsonp("GetComuniCatastali", {
    idProvincia: province.id,
    term: "",
  });
  const comuni = normalizeItems(comuniPayload, `comuni ${province.id}`);
  completed += 1;
  process.stdout.write(
    `\rforMaps: ${completed}/${provinces.length} province, ${province.id} ${comuni.length} comuni`,
  );
  return { ...province, comuni };
});
process.stdout.write("\n");

const municipalityCount = catalogProvinces.reduce(
  (total, province) => total + province.comuni.length,
  0,
);
if (municipalityCount < 7_000) {
  throw new Error(`Catalogo comuni forMaps incompleto: ${municipalityCount} elementi`);
}

const checksumPayload = JSON.stringify(catalogProvinces);
const catalog = {
  generatedAt: new Date().toISOString(),
  source: {
    baseUrl: BASE_URL,
    provinceEndpoint: "GetProvinceCatastali",
    municipalityEndpoint: "GetComuniCatastali",
  },
  sha256: createHash("sha256").update(checksumPayload).digest("hex"),
  provinceCount: catalogProvinces.length,
  municipalityCount,
  provinces: catalogProvinces,
};

await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
const provinceNamesByCode = Object.fromEntries(
  catalogProvinces.map((province) => [province.id, titleCase(province.text)]),
);
await writeFile(
  WEB_PROVINCES_OUTPUT_PATH,
  `// Generato da npm run formaps:sync. Non modificare manualmente.\nexport const FORMAPS_PROVINCE_NAMES_BY_CODE: Readonly<Record<string, string>> = ${JSON.stringify(provinceNamesByCode, null, 2)};\n`,
  "utf8",
);
process.stdout.write(
  `Salvati ${OUTPUT_PATH} e ${WEB_PROVINCES_OUTPUT_PATH}: ${catalog.provinceCount} province, ${catalog.municipalityCount} comuni, SHA-256 ${catalog.sha256}\n`,
);

async function fetchJsonp(endpoint, parameters) {
  const url = new URL(endpoint, BASE_URL);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("callback", CALLBACK);
  url.searchParams.set("_", String(Date.now()));

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/javascript, application/json;q=0.9, */*;q=0.8",
          Referer: "https://www.formaps.it/Mappa",
          "User-Agent": "Soul-PQ forMaps territory catalog sync",
        },
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
      const firstParenthesis = text.indexOf("(");
      const lastParenthesis = text.lastIndexOf(")");
      if (firstParenthesis < 0 || lastParenthesis <= firstParenthesis) {
        throw new Error(`JSONP non valido: ${text.slice(0, 160)}`);
      }
      return JSON.parse(text.slice(firstParenthesis + 1, lastParenthesis));
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(250 * 2 ** (attempt - 1));
    }
  }
  throw new Error(
    `${endpoint} non disponibile: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function normalizeItems(payload, label) {
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error(`Risposta forMaps senza items per ${label}`);
  }
  const seen = new Set();
  return payload.items.map((item) => {
    const id = String(item?.id ?? "").trim();
    const text = String(item?.text ?? "").trim();
    if (!id || !text) throw new Error(`Elemento forMaps non valido in ${label}`);
    if (seen.has(id)) throw new Error(`ID forMaps duplicato ${id} in ${label}`);
    seen.add(id);
    return { id, text };
  });
}

async function mapLimit(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await task(items[index], index);
      }
    }),
  );
  return results;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function titleCase(value) {
  return value
    .toLocaleLowerCase("it-IT")
    .replace(/(^|[\s'-])(\p{L})/gu, (_match, prefix, letter) => `${prefix}${letter.toLocaleUpperCase("it-IT")}`);
}
