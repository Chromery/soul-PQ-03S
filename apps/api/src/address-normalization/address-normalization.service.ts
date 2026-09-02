import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type AddressNormalizationInput = {
  address?: string | null;
  ubicazione?: string | null;
  comune?: string | null;
  provincia?: string | null;
};

const DEFAULT_NEURALWATT_API_URL = "https://api.neuralwatt.com/v1/chat/completions";
const DEFAULT_ADDRESS_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_BACKGROUND_CONCURRENCY = 3;
const MAX_ADDRESS_LENGTH = 240;

type BackgroundNormalizationJob = {
  key: string;
  input: AddressNormalizationInput;
  resolve: (address: string | null) => void;
  reject: (error: unknown) => void;
};

@Injectable()
export class AddressNormalizationService {
  private readonly logger = new Logger(AddressNormalizationService.name);
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly backgroundConcurrency: number;
  private readonly pending = new Map<string, Promise<string | null>>();
  private readonly backgroundPending = new Map<string, Promise<string | null>>();
  private readonly backgroundQueue: BackgroundNormalizationJob[] = [];
  private activeBackgroundJobs = 0;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = optionalString(config.get<string>("NEURALWATT_API_URL")) ?? DEFAULT_NEURALWATT_API_URL;
    this.model = optionalString(config.get<string>("NEURALWATT_ADDRESS_MODEL")) ?? DEFAULT_ADDRESS_MODEL;
    this.timeoutMs = boundedInteger(config.get<string>("NEURALWATT_ADDRESS_TIMEOUT_MS"), DEFAULT_TIMEOUT_MS);
    this.backgroundConcurrency = boundedConcurrency(
      config.get<string>("NEURALWATT_ADDRESS_BACKGROUND_CONCURRENCY"),
      DEFAULT_BACKGROUND_CONCURRENCY,
    );
  }

  normalize(input: AddressNormalizationInput) {
    const fallback = fallbackHumanReadableAddress(input);
    if (!fallback) return Promise.resolve(null);

    const key = normalizationKey(input);
    const existing = this.pending.get(key);
    if (existing) return existing;

    const request = this.normalizeWithNeuralwatt(input, fallback)
      .catch((error) => {
        this.logger.warn(
          `Normalizzazione indirizzo con NeuralWatt non riuscita; applicato il fallback locale: ${errorMessage(error)}`,
        );
        return fallback;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  normalizeInBackground(input: AddressNormalizationInput) {
    const fallback = fallbackHumanReadableAddress(input);
    if (!fallback) return Promise.resolve(null);

    const key = normalizationKey(input);
    const running = this.pending.get(key);
    if (running) return running;
    const queued = this.backgroundPending.get(key);
    if (queued) return queued;

    let resolveJob!: (address: string | null) => void;
    let rejectJob!: (error: unknown) => void;
    const result = new Promise<string | null>((resolve, reject) => {
      resolveJob = resolve;
      rejectJob = reject;
    });
    this.backgroundPending.set(key, result);
    this.backgroundQueue.push({ key, input, resolve: resolveJob, reject: rejectJob });
    this.drainBackgroundQueue();
    return result;
  }

  private drainBackgroundQueue() {
    while (
      this.activeBackgroundJobs < this.backgroundConcurrency
      && this.backgroundQueue.length > 0
    ) {
      const job = this.backgroundQueue.shift();
      if (!job) return;
      this.activeBackgroundJobs++;
      void Promise.resolve()
        .then(() => this.normalize(job.input))
        .then(job.resolve, job.reject)
        .finally(() => {
          this.backgroundPending.delete(job.key);
          this.activeBackgroundJobs--;
          this.drainBackgroundQueue();
        });
    }
  }

  private async normalizeWithNeuralwatt(input: AddressNormalizationInput, fallback: string) {
    const apiKey = optionalString(this.config.get<string>("NEURALWATT_API_KEY"));
    if (!apiKey || apiKey.includes("REPLACE_")) {
      throw new Error("NEURALWATT_API_KEY non configurata");
    }

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "Normalizza indirizzi postali italiani per una presentazione aziendale. "
              + "Restituisci esclusivamente JSON valido nel formato {\"address\":\"...\"}. "
              + "L'indirizzo deve contenere solo odonimo e numero civico, in forma leggibile (esempio: Via delle Industrie 44). "
              + "Rimuovi comune, provincia, CAP, piano e riferimenti catastali. Non inventare informazioni mancanti e conserva suffissi del civico.",
          },
          {
            role: "user",
            content: JSON.stringify({
              indirizzo: compactText(input.address),
              ubicazione: compactText(input.ubicazione),
              comune: compactText(input.comune),
              provincia: compactText(input.provincia)?.toUpperCase(),
            }),
          },
        ],
        temperature: 0,
        max_tokens: 180,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(`NeuralWatt HTTP ${response.status}: ${safeProviderError(rawBody)}`);
    }
    const candidate = addressFromProviderResponse(rawBody);
    return sanitizeAddress(candidate) ?? fallback;
  }
}

export function fallbackHumanReadableAddress(input: AddressNormalizationInput) {
  const source = compactText(input.address) ?? compactText(input.ubicazione);
  if (!source) return null;

  let value = source;
  const comune = compactText(input.comune);
  const provincia = compactText(input.provincia);
  if (comune) {
    const provincePattern = provincia ? escapeRegExp(provincia) : "[A-Z]{2}";
    const locality = new RegExp(
      `^${escapeRegExp(comune)}(?:\\s*\\(\\s*${provincePattern}\\s*\\))?\\s*[,;:-]?\\s*`,
      "iu",
    );
    value = value.replace(locality, "");
  }
  value = value
    .replace(/\b(?:piano|scala|interno|int\.?|foglio|particella|sub(?:alterno)?)\b.*$/iu, "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:\s-]+|[,;:\s-]+$/g, "")
    .trim();
  return sanitizeAddress(humanizeAllCaps(value)) ?? sanitizeAddress(source);
}

function addressFromProviderResponse(rawBody: string) {
  const response = parseJsonRecord(rawBody);
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object" || Array.isArray(firstChoice)) {
    throw new Error("risposta NeuralWatt priva di choices");
  }
  const message = (firstChoice as Record<string, unknown>).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("risposta NeuralWatt priva del messaggio");
  }
  const content = (message as Record<string, unknown>).content;
  if (typeof content !== "string") throw new Error("contenuto NeuralWatt non testuale");
  const payload = parseJsonRecord(content);
  if (typeof payload.address !== "string") throw new Error("campo address mancante nella risposta NeuralWatt");
  return payload.address;
}

function parseJsonRecord(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON non trovato nella risposta NeuralWatt");
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON NeuralWatt non valido");
  }
  return parsed as Record<string, unknown>;
}

function sanitizeAddress(value: string | null | undefined) {
  const normalized = compactText(value)?.replace(/^['"]|['"]$/g, "");
  if (!normalized) return null;
  return normalized.slice(0, MAX_ADDRESS_LENGTH);
}

function humanizeAllCaps(value: string) {
  if (!value || value !== value.toLocaleUpperCase("it-IT")) return value;
  const lowercaseWords = new Set(["a", "da", "dal", "dalla", "de", "del", "della", "delle", "di", "in", "n.", "sul"]);
  return value
    .toLocaleLowerCase("it-IT")
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && lowercaseWords.has(word)) return word;
      return word.replace(/(^|[-'])(\p{L})/gu, (_match, separator: string, letter: string) => (
        `${separator}${letter.toLocaleUpperCase("it-IT")}`
      ));
    })
    .join(" ");
}

function compactText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized || null;
}

function optionalString(value: unknown) {
  return compactText(value);
}

function boundedInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2_000 && parsed <= 120_000 ? parsed : fallback;
}

function boundedConcurrency(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : fallback;
}

function normalizationKey(input: AddressNormalizationInput) {
  return JSON.stringify([
    compactText(input.address),
    compactText(input.ubicazione),
    compactText(input.comune),
    compactText(input.provincia),
  ]);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeProviderError(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 300) || "risposta vuota";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "errore sconosciuto";
}
