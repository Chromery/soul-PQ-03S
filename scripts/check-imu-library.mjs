import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const DATASET_MARKER = "export const IMU_RATE_RECORDS: ImuRateRecord[] = ";

export async function readImuRecords(datasetPath) {
  const source = await readFile(datasetPath, "utf8");
  const start = source.indexOf(DATASET_MARKER);
  if (start < 0) throw new Error("Dataset IMU generato non riconosciuto");
  const records = JSON.parse(source.slice(start + DATASET_MARKER.length).trim().replace(/;$/, ""));
  if (!Array.isArray(records) || !records.length) throw new Error("Dataset IMU vuoto o non valido");
  return records;
}

// Read-only: verify every PDF referenced by the deployed dataset, not just the directory.
export async function checkImuLibrary(records, libraryDirectory) {
  if (!records.length) throw new Error("Nessuna delibera da verificare");
  const root = path.resolve(libraryDirectory);
  const physicalRoot = await realpath(root).catch(error => {
    if (error.code === "ENOENT") return root;
    throw error;
  });
  const report = { ok: true, expected: records.length, verified: 0, missing: 0, invalid: 0, bytes: 0, issues: [] };
  const fail = (kind, sourcePath, reason) => {
    report.ok = false; report[kind]++;
    if (report.issues.length < 20) report.issues.push({ sourcePath, reason });
  };
  for (const record of records) {
    const sourcePath = typeof record.sourcePath === "string" ? record.sourcePath.replaceAll("\\", "/") : "";
    const target = path.resolve(root, sourcePath);
    if (!sourcePath || path.isAbsolute(sourcePath) || !target.startsWith(root + path.sep)
      || !/^[a-f0-9]{64}$/i.test(record.sha256 ?? "")) {
      fail("invalid", sourcePath, "Riferimento del dataset non valido"); continue;
    }
    try {
      if (!(await realpath(target)).startsWith(physicalRoot + path.sep)) {
        fail("invalid", sourcePath, "File esterno alla libreria"); continue;
      }
      const info = await stat(target);
      if (!info.isFile() || info.size <= 5 || info.size > MAX_DOCUMENT_BYTES) {
        fail("invalid", sourcePath, "Dimensione o tipo di file non valido"); continue;
      }
      const data = await readFile(target);
      if (!data.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
        fail("invalid", sourcePath, "Intestazione PDF assente"); continue;
      }
      if (createHash("sha256").update(data).digest("hex") !== record.sha256.toLowerCase()) {
        fail("invalid", sourcePath, "SHA-256 diverso dal documento usato per il calcolo"); continue;
      }
      report.verified++; report.bytes += data.length;
    } catch (error) {
      if (error.code === "ENOENT") fail("missing", sourcePath, "PDF assente");
      else fail("invalid", sourcePath, `File non leggibile (${error.code ?? error.name})`);
    }
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const option = name => process.argv.slice(2).find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const library = option("library");
    if (!library) throw new Error("Specificare --library=/percorso/della/libreria");
    const dataset = option("dataset") ?? fileURLToPath(new URL("../apps/api/src/imu/imu-rates.generated.ts", import.meta.url));
    const report = await checkImuLibrary(await readImuRecords(dataset), library);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
