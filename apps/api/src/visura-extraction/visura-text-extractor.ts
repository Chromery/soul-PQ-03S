import { spawn } from "node:child_process";

export type DeterministicVisuraTextResult = {
  found: boolean;
  provincia: string | null;
  comune: string | null;
  codiceComuneCatastale: string | null;
  sezioneCatastale: string | null;
  sezioneUrbana: string | null;
  foglio: string | null;
  particella: string | null;
  evidence: string | null;
};

const MAX_PDF_TEXT_BYTES = 8 * 1024 * 1024;

export async function extractTextFromPdf(buffer: Buffer, timeoutMs = 30_000) {
  if (buffer.byteLength === 0) throw new Error("PDF vuoto");
  return new Promise<string>((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", "-", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error(`pdftotext timeout dopo ${Math.round(timeoutMs / 1_000)}s`)));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > MAX_PDF_TEXT_BYTES) {
        child.kill("SIGKILL");
        finish(() => reject(new Error("Testo PDF oltre il limite di 8 MB")));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => {
      finish(() => {
        const text = Buffer.concat(stdout).toString("utf8").trim();
        if (code === 0) resolve(text);
        else reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `pdftotext terminato con codice ${code}`));
      });
    });
    child.stdin.once("error", (error) => finish(() => reject(error)));
    child.stdin.end(buffer);
  });
}

export function extractCadastralDataFromText(text: string): DeterministicVisuraTextResult {
  const normalized = text.replace(/\s+/g, " ").trim();
  const municipalityMatch = normalized.match(
    /Comune\s+di\s+(.+?)\s+\(Codice:\s*([A-Z0-9]+)\)/i,
  );
  const province = normalized.match(
    /Provincia\s+di\s+([A-ZÀ-Ü' -]+?)(?=\s+Catasto\s+|\s+Sez\.?\s*Urb|\s+Foglio:|$)/i,
  )?.[1];
  const identifiers = normalized.match(
    /Foglio:\s*([A-Z0-9/-]+)\s+Particella:\s*([A-Z0-9/-]+)/i,
  );
  const comune = cleanValue(municipalityMatch?.[1]);
  const codiceComuneCatastale = cleanValue(municipalityMatch?.[2])?.toUpperCase() ?? null;
  const foglio = cleanValue(identifiers?.[1]);
  const particella = cleanValue(identifiers?.[2]);
  const correlatedSections = Array.from(normalized.matchAll(
    /Codice\s+Comune\s+([A-Z0-9]+)\s*-\s*Sezione\s+([A-Z0-9-]+)\s*-\s*Foglio\s+([A-Z0-9/-]+)\s*-\s*Particella\s+([A-Z0-9/-]+)/gi,
  ));
  const correlated = correlatedSections.find((match) => (
    sameIdentifier(match[1], codiceComuneCatastale)
    && sameIdentifier(match[3], foglio)
    && sameIdentifier(match[4], particella)
  )) ?? correlatedSections.find((match) => (
    sameIdentifier(match[1], codiceComuneCatastale)
    && sameIdentifier(match[4], particella)
  )) ?? correlatedSections.find((match) => (
    sameIdentifier(match[1], codiceComuneCatastale)
    && sameIdentifier(match[3], foglio)
  ));
  const urbanSection = normalized.match(
    /Catasto\s+Fabbricati\s+Sez\.?\s*Urb\.?:\s*([A-Z0-9-]+)\s+Foglio:/i,
  )?.[1];
  const sezioneUrbana = cleanValue(urbanSection)?.toUpperCase() ?? null;
  const correlatedSection = cleanValue(correlated?.[2])?.toUpperCase() ?? null;
  const sezioneCatastale = correlatedSection
    ?? (sezioneUrbana && sezioneUrbana.length <= 2 ? sezioneUrbana : null);
  const provincia = cleanValue(province);
  const found = Boolean(comune && provincia && foglio && particella);
  const evidenceParts = [
    comune ? `Comune di ${comune}${codiceComuneCatastale ? ` (Codice:${codiceComuneCatastale})` : ""}` : null,
    provincia ? `Provincia di ${provincia}` : null,
    foglio && particella ? `Foglio: ${foglio} Particella: ${particella}` : null,
    sezioneCatastale ? `Sezione catastale: ${sezioneCatastale}` : null,
    sezioneUrbana && sezioneUrbana !== sezioneCatastale ? `Sezione urbana: ${sezioneUrbana}` : null,
  ].filter((value): value is string => Boolean(value));
  return {
    found,
    provincia,
    comune,
    codiceComuneCatastale,
    sezioneCatastale,
    sezioneUrbana,
    foglio,
    particella,
    evidence: evidenceParts.length > 0 ? evidenceParts.join(" | ") : null,
  };
}

export function municipalityWithSection(municipality: string | null | undefined, section: string | null | undefined) {
  const base = municipalityWithoutSection(municipality);
  const normalizedSection = cleanValue(section)?.toUpperCase();
  if (!base) return null;
  return normalizedSection ? `${base}/sez.${normalizedSection}` : base;
}

export function municipalityWithoutSection(municipality: string | null | undefined) {
  return cleanValue(municipality?.replace(/\s*\/\s*sez\.\s*[A-Z0-9-]+\s*$/i, ""));
}

export function sectionFromMunicipality(municipality: string | null | undefined) {
  return municipality?.match(/\/\s*sez\.\s*([A-Z0-9-]+)/i)?.[1]?.toUpperCase() ?? null;
}

function cleanValue(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") || null;
}

function sameIdentifier(first: string | null | undefined, second: string | null | undefined) {
  return Boolean(first && second && first.trim().toUpperCase() === second.trim().toUpperCase());
}
