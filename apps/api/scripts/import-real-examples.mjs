import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const extractedDir = path.join(repoRoot, "Esempi reali con visure e planimetrie");
const defaultExamplesRoot = path.join(extractedDir, "Calcolo Rendita");
const examplesRoot = path.resolve(process.argv[2] ?? process.env.REAL_EXAMPLES_DIR ?? defaultExamplesRoot);
const zipPath = path.join(repoRoot, "Esempi reali con visure e planimetrie.zip");

const EXPECTED_BY_COMPANY = {
  "COSSA POLIMERI S.R.L": { comune: "Gorla Maggiore", provincia: "VA", foglio: "11" },
  "MENPHIS S.P.A": { comune: "Casnate Con Bernate", provincia: "CO", foglio: "4" },
  "VENETA NASTRI SPA": { comune: "San Fior", provincia: "TV", foglio: "5" },
};

async function main() {
  ensureExamplesAvailable();
  const studies = buildStudies();
  if (studies.length === 0) throw new Error(`Nessuno studio trovato in ${examplesRoot}`);

  const response = await postJson("/integrations/erp/v1/studi/sync", {
    sync_id_erp: `REAL-EXAMPLES-${new Date().toISOString()}`,
    studi: studies,
  });

  console.log(`Import completato: ${response.ricevuti} studi, ${response.risultati?.length ?? 0} risultati`);
  for (const result of response.risultati ?? []) {
    console.log(
      `${result.studio_erp_id}: ${result.azione}, immobili ${result.immobili_upserted}, documenti ${result.documenti_salvati}, visure estratte ${result.visure_estratte}`,
    );
    for (const error of result.visure_errori ?? []) {
      console.warn(`Visura non estratta ${error.immobile_erp_id} (${error.file_nome}): ${error.errore}`);
    }
  }

  await verifyImportedStudies(studies);
}

function ensureExamplesAvailable() {
  if (fs.existsSync(examplesRoot)) return;
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Cartella esempi non trovata (${examplesRoot}) e zip non presente (${zipPath})`);
  }
  fs.mkdirSync(extractedDir, { recursive: true });
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", extractedDir], { stdio: "inherit" });
}

function buildStudies() {
  return fs
    .readdirSync(examplesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("__MACOSX"))
    .sort((a, b) => a.name.localeCompare(b.name, "it"))
    .map((entry) => buildStudy(entry.name, path.join(examplesRoot, entry.name)));
}

function buildStudy(companyName, companyDir) {
  const expected = EXPECTED_BY_COMPANY[companyName];
  if (!expected) throw new Error(`Manca configurazione attesa per ${companyName}`);

  const pdfs = fs
    .readdirSync(companyDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf") && !name.startsWith("._"))
    .sort(sortPlanDocuments);
  const visure = pdfs.filter((name) => /^vis[. ]/i.test(name));
  const planDocuments = pdfs
    .filter((name) => !/^vis[. ]/i.test(name))
    .map((name) => ({
      name,
      ...inferPlanCadastral(path.join(companyDir, name)),
    }));
  const usedPlanDocuments = new Set();
  const slug = slugify(companyName);

  const immobili = visure.map((visuraName, index) => {
    const particella = extractParticella(visuraName);
    const selectedPlanDocuments = pickPlanDocuments(planDocuments, usedPlanDocuments, particella, index, visure.length);
    const documenti = [
      buildDocument(path.join(companyDir, visuraName), "visura_catastale", `${slug}-VIS-${particella || index + 1}`),
      ...selectedPlanDocuments.map((planDocument, planIndex) =>
        buildDocument(
          path.join(companyDir, planDocument.name),
          planIndex === 0 ? "planimetria" : "elaborato_planimetrico",
          `${slug}-${planIndex === 0 ? "PLA" : "ELA"}-${particella || index + 1}`,
        ),
      ),
    ];

    return {
      immobile_erp_id: `IMM-REAL-${slug}-${particella || index + 1}`,
      indirizzo_normalizzato: "",
      ubicazione: "",
      comune: "",
      provincia: "",
      foglio: "",
      particella: "",
      categoria: "D/1",
      classamento: "Cat.D/1",
      titolarita: "proprietario",
      rendita_attuale: "0.00",
      rendita_proposta: "0.00",
      imu_attuale: "0.00",
      imu_prevista: "0.00",
      in_studio: true,
      esito: "non_analizzato",
      ordine_visualizzazione: index,
      documenti,
      _expected: {
        ...expected,
        particella,
      },
    };
  });

  return {
    studio_erp_id: `SF-REAL-${slug}`,
    company_erp_id: `REAL-${slug}`,
    ragione_sociale: companyName,
    partita_iva: `REAL-${slug}`.slice(0, 32),
    stato_studio: "in_progress",
    data_creazione_studio: "2026-06-30T00:00:00+02:00",
    data_importazione_erp: new Date().toISOString(),
    data_scadenza: "2026-07-30",
    commerciale_assegnato: "Import esempi reali",
    responsabile_tecnico: null,
    note: "Studio importato dagli esempi reali con visure e planimetrie.",
    versione_numero: 1,
    metriche: {
      rendita_originale_totale: "0.00",
      rendita_proposta_totale: "0.00",
      differenza_rendita: "0.00",
      imu_attuale_totale: "0.00",
      imu_prevista_totale: "0.00",
      differenza_imu: "0.00",
      rendita_categoria_d: "0.00",
    },
    immobili,
  };
}

function pickPlanDocuments(planDocuments, used, particella, index, totalVisure) {
  const exact = planDocuments.filter((document) => !used.has(document.name) && particella && document.particella === particella);
  const selected = exact.slice(0, 2);

  if (selected.length === 0 && totalVisure === 1) {
    selected.push(...planDocuments.filter((document) => !used.has(document.name)).slice(0, 2));
  }

  for (const document of selected) used.add(document.name);
  return selected;
}

function buildDocument(filePath, tipo, documentId) {
  const buffer = fs.readFileSync(filePath);
  return {
    tipo,
    documento_erp_id: documentId,
    file_nome: path.basename(filePath),
    mime_type: "application/pdf",
    file_base64: buffer.toString("base64"),
    sha256: createHash("sha256").update(buffer).digest("hex"),
    dimensione_byte: buffer.byteLength,
  };
}

async function verifyImportedStudies(studies) {
  const failures = [];
  for (const study of studies) {
    const imported = await getJson(`/studies/${encodeURIComponent(study.studio_erp_id)}`);
    for (const expectedProperty of study.immobili) {
      const expected = expectedProperty._expected;
      const importedProperty = imported.properties.find((property) => property.id === expectedProperty.immobile_erp_id);
      if (!importedProperty) {
        failures.push(`${expectedProperty.immobile_erp_id}: immobile non trovato dopo import`);
        continue;
      }
      for (const [field, expectedValue] of Object.entries(expected)) {
        if (!expectedValue) continue;
        const actual = normalizeComparable(importedProperty[field]);
        const wanted = normalizeComparable(expectedValue);
        if (actual !== wanted) {
          failures.push(`${expectedProperty.immobile_erp_id}: ${field} atteso ${expectedValue}, ricevuto ${importedProperty[field]}`);
        }
      }
      if (!importedProperty.documentUrls?.visura) {
        failures.push(`${expectedProperty.immobile_erp_id}: URL visura mancante`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Verifica import non riuscita:\n${failures.join("\n")}`);
  }
  console.log("Verifica import riuscita: provincia, comune, foglio, particella e visure risultano presenti.");
}

async function postJson(pathname, body) {
  const response = await fetch(apiUrl(pathname), {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(stripInternalFields(body)),
  });
  return parseJsonResponse(response);
}

async function getJson(pathname) {
  const response = await fetch(apiUrl(pathname), {
    headers: requestHeaders(),
  });
  return parseJsonResponse(response);
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${typeof data === "string" ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

function requestHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (process.env.ERP_SYNC_TOKEN) headers.Authorization = `Bearer ${process.env.ERP_SYNC_TOKEN}`;
  return headers;
}

function apiUrl(pathname) {
  const base = (process.env.PQ_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  const apiBase = base.endsWith("/api") ? base : `${base}/api`;
  return `${apiBase}${pathname}`;
}

function stripInternalFields(value) {
  if (Array.isArray(value)) return value.map(stripInternalFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, entry]) => [key, stripInternalFields(entry)]),
  );
}

function sortPlanDocuments(a, b) {
  const aRank = /^doc_/i.test(a) ? 0 : /^epa/i.test(a) ? 1 : 2;
  const bRank = /^doc_/i.test(b) ? 0 : /^epa/i.test(b) ? 1 : 2;
  if (aRank !== bRank) return aRank - bRank;
  return a.localeCompare(b, "it", { numeric: true });
}

function extractParticella(fileName) {
  const explicit = fileName.match(/part[._ ]+(\d+)/i)?.[1];
  if (explicit) return explicit;
  const candidates = Array.from(fileName.matchAll(/\b(\d{3,5})\b/g))
    .map((match) => match[1])
    .filter((value) => !/^0+$/.test(value) && value !== "001");
  return candidates.at(-1) ?? "";
}

function inferPlanCadastral(filePath) {
  const fileName = path.basename(filePath);
  const fromName = extractParticella(fileName);
  try {
    const text = execFileSync("pdftotext", ["-layout", filePath, "-"], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    const compact = text.replace(/\s+/g, " ");
    const direct = compact.match(/Foglio\s*:?\s*([A-Z0-9/-]+)\s+Particella\s*:?\s*([A-Z0-9/-]+)/i);
    if (direct) {
      return {
        foglio: direct[1],
        particella: fromName || direct[2],
      };
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const headerIndex = lines.findIndex((line) => /Comune\s+Sezione\s+Foglio\s+Particella/i.test(line));
    for (const line of lines.slice(Math.max(0, headerIndex + 1), headerIndex >= 0 ? headerIndex + 8 : 0)) {
      const row = line.match(/^[A-ZÀ-Ü' ]+\s+(?:[A-Z]{1,4}\s+)?([0-9A-Z/-]+)\s+([0-9A-Z/-]+)(?:\s|$)/i);
      if (row) {
        return {
          foglio: row[1],
          particella: fromName || row[2],
        };
      }
    }
  } catch {
    // The file name match is still useful if pdftotext is unavailable.
  }
  return {
    foglio: "",
    particella: fromName,
  };
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeComparable(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
