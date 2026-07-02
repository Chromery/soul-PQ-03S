import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { VisuraExtractionStatus } from "../generated/prisma/enums.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

type JsonRecord = Record<string, unknown>;

type ExtractVisuraInput = {
  fileName: string;
  fileBase64: string;
  sha256?: string;
};

type EnqueueVisuraDocumentInput = {
  propertyId: string;
  documentId: string;
  fileName: string;
  fileBase64: string;
  sha256?: string;
};

export type VisuraExtractionResult = {
  found: boolean;
  provincia: string | null;
  comune: string | null;
  foglio: string | null;
  particella: string | null;
  confidence: number;
  evidence: string | null;
  warnings: string[];
};

const DEFAULT_VISURA_MODEL = "qwen/qwen3.5-flash-02-23";

const VISURA_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "provincia", "comune", "foglio", "particella", "confidence", "evidence", "warnings"],
  properties: {
    found: { type: "boolean" },
    provincia: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    comune: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    foglio: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    particella: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

@Injectable()
export class VisuraExtractionService implements OnModuleInit {
  private readonly model: string;
  private readonly siteUrl: string;
  private readonly appTitle: string;
  private readonly pdfEngine: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.model =
      optionalConfig(config.get<string>("OPENROUTER_VISURA_MODEL")) ??
      optionalConfig(config.get<string>("OPENROUTER_SCALE_MODEL")) ??
      DEFAULT_VISURA_MODEL;
    this.siteUrl = optionalConfig(config.get<string>("OPENROUTER_SITE_URL")) ?? "http://localhost:8080";
    this.appTitle = optionalConfig(config.get<string>("OPENROUTER_APP_TITLE")) ?? "Soul Prospect Qualifier";
    this.pdfEngine = optionalConfig(config.get<string>("OPENROUTER_PDF_ENGINE")) ?? "mistral-ocr";
    this.timeoutMs = positiveIntegerConfig(config.get<string>("OPENROUTER_VISURA_TIMEOUT_MS")) ?? 180_000;
  }

  async onModuleInit() {
    await this.prisma.visuraExtractionJob.updateMany({
      where: {
        status: {
          in: [VisuraExtractionStatus.PENDING, VisuraExtractionStatus.RUNNING],
        },
      },
      data: {
        status: VisuraExtractionStatus.FAILED,
        errorMessage: "Job interrotto da riavvio API; ripetere la sync ERP per riaccodare l'estrazione.",
        completedAt: new Date(),
      },
    });
  }

  async extractFromBase64(input: ExtractVisuraInput) {
    const { buffer, sha256, dataUrl } = decodePdfBase64(input.fileBase64, input.fileName);
    if (input.sha256 && input.sha256.toLowerCase() !== sha256) {
      throw new BadRequestException(`SHA256 non coerente per ${input.fileName}`);
    }
    return this.extractVisura({
      fileName: input.fileName,
      fileData: dataUrl,
      sizeBytes: buffer.byteLength,
    });
  }

  async enqueueDocumentPdf(input: EnqueueVisuraDocumentInput) {
    const { buffer, sha256, dataUrl } = decodePdfBase64(input.fileBase64, input.fileName);
    if (input.sha256 && input.sha256.toLowerCase() !== sha256) {
      throw new BadRequestException(`SHA256 non coerente per ${input.fileName}`);
    }

    const job = await this.prisma.visuraExtractionJob.create({
      data: {
        propertyId: input.propertyId,
        documentId: input.documentId,
        status: VisuraExtractionStatus.PENDING,
        model: this.model,
        sourceFileName: input.fileName,
        sourceSha256: sha256,
      },
    });

    const process = this.runJob(job.id, {
      fileName: input.fileName,
      fileData: dataUrl,
      sizeBytes: buffer.byteLength,
    });
    void process.catch((error) => console.error("Visura extraction job failed", error));
    return {
      id: job.id,
      propertyId: job.propertyId,
      documentId: job.documentId,
      status: job.status,
      sourceFileName: job.sourceFileName,
      sourceSha256: job.sourceSha256,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private async runJob(
    jobId: string,
    source: { fileName: string; fileData: string; sizeBytes: number },
  ) {
    const startedAt = new Date();
    await this.prisma.visuraExtractionJob.update({
      where: { id: jobId },
      data: {
        status: VisuraExtractionStatus.RUNNING,
        startedAt,
        errorMessage: null,
      },
    });

    try {
      const result = await this.extractVisura(source);
      const completedAt = new Date();
      const updatedJob = await this.prisma.visuraExtractionJob.update({
        where: { id: jobId },
        data: {
          status: VisuraExtractionStatus.SUCCEEDED,
          extractedProvincia: result.found ? result.provincia : null,
          extractedComune: result.found ? result.comune : null,
          extractedFoglio: result.found ? result.foglio : null,
          extractedParticella: result.found ? result.particella : null,
          confidence: result.confidence,
          evidence: result.evidence,
          warnings: result.warnings as unknown as Prisma.InputJsonValue,
          rawResponse: result as unknown as Prisma.InputJsonValue,
          completedAt,
        },
      });
      if (result.found) await this.persistExtractedCadastralData(updatedJob.propertyId, result);
    } catch (error) {
      const completedAt = new Date();
      await this.prisma.visuraExtractionJob.update({
        where: { id: jobId },
        data: {
          status: VisuraExtractionStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : "Errore sconosciuto",
          completedAt,
        },
      });
      throw error;
    }
  }

  private async persistExtractedCadastralData(propertyId: string, result: VisuraExtractionResult) {
    await this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: propertyId },
        select: {
          address: true,
          comune: true,
          provincia: true,
          ubicazione: true,
          foglio: true,
          particella: true,
        },
      });
      if (!property) return;

      const comune = property.comune || result.comune || "";
      const provincia = property.provincia || result.provincia || null;
      const address =
        property.address || (comune ? (provincia ? `${comune} (${provincia})` : comune) : property.address);
      const data = {
        provincia,
        comune,
        foglio: property.foglio || result.foglio || null,
        particella: property.particella || result.particella || null,
        address,
        ubicazione: property.ubicazione || address || null,
      };

      await tx.property.update({
        where: { id: propertyId },
        data,
      });
    });
  }

  private async extractVisura(source: { fileName: string; fileData: string; sizeBytes: number }) {
    const primary = parseOpenRouterVisuraExtraction(await this.callOpenRouterVisuraExtraction(source, false));
    if (!primary.found || !primary.provincia || !primary.comune || !primary.foglio || !primary.particella) {
      try {
        const retry = parseOpenRouterVisuraExtraction(await this.callOpenRouterVisuraExtraction(source, true));
        if (scoreExtraction(retry) > scoreExtraction(primary)) return retry;
      } catch (error) {
        return {
          ...primary,
          warnings: [
            ...primary.warnings,
            error instanceof Error ? `Secondo tentativo non riuscito: ${error.message}` : "Secondo tentativo non riuscito",
          ],
        };
      }
    }
    return primary;
  }

  private async callOpenRouterVisuraExtraction(
    source: { fileName: string; fileData: string; sizeBytes: number },
    retry: boolean,
  ) {
    const apiKey = optionalConfig(this.config.get<string>("OPENROUTER_API_KEY"));
    if (!apiKey || apiKey.includes("REPLACE_")) {
      throw new InternalServerErrorException("OPENROUTER_API_KEY non configurata per estrazione visura");
    }

    const payload: JsonRecord = {
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "Sei un tecnico catastale italiano. Estrai solo dati espliciti da visure catastali PDF. Non usare il nome file. Rispondi esclusivamente con JSON valido conforme allo schema.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analizza la visura e restituisci i dati dell'immobile principale indicati nei Dati della richiesta o nella prima riga dei DATI IDENTIFICATIVI: provincia, comune, foglio e particella. Per provincia preferisci la sigla automobilistica se e esplicita o ricavabile dalla denominazione (es. COMO -> CO, VARESE -> VA, TREVISO -> TV). Per comune usa il nome del comune, senza codice catastale. Foglio e particella devono rimanere stringhe esatte, senza zeri aggiunti e senza includere il subalterno. Se un dato non e leggibile usa null. Riporta in evidence la riga o le parole lette nella visura." +
                (retry
                  ? " Questo e un secondo tentativo: controlla in particolare l'intestazione 'Dati della richiesta', 'Comune di', 'Provincia di', 'Foglio:' e 'Particella:'."
                  : ""),
            },
            {
              type: "file",
              file: {
                filename: source.fileName,
                file_data: source.fileData,
              },
            },
          ],
        },
      ],
      temperature: 0,
      seed: retry ? 101 : 100,
      max_tokens: 1200,
      include_reasoning: false,
      reasoning: {
        exclude: true,
      },
      plugins: [
        {
          id: "file-parser",
          pdf: {
            engine: this.pdfEngine,
          },
        },
      ],
    };

    if (!retry) {
      payload.response_format = {
        type: "json_schema",
        json_schema: {
          name: "visura_catastale_identificativi",
          strict: true,
          schema: VISURA_EXTRACTION_SCHEMA,
        },
      };
      payload.provider = {
        require_parameters: true,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": this.siteUrl,
          "X-Title": this.appTitle,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawBody = await response.text();
      if (!response.ok) {
        throw new Error(`OpenRouter HTTP ${response.status}: ${rawBody.slice(0, 500)}`);
      }
      return rawBody;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`OpenRouter timeout visura dopo ${Math.round(this.timeoutMs / 1000)}s`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function decodePdfBase64(value: string, fileName: string) {
  const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  if (!payload.trim()) throw new BadRequestException(`file_base64 mancante per ${fileName}`);
  const buffer = Buffer.from(payload, "base64");
  if (buffer.byteLength === 0) throw new BadRequestException(`file_base64 non valido per ${fileName}`);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  return {
    buffer,
    sha256,
    dataUrl: `data:application/pdf;base64,${buffer.toString("base64")}`,
  };
}

function parseOpenRouterVisuraExtraction(rawBody: string) {
  const data = parseJsonRecord(rawBody, "risposta OpenRouter");
  if (!Array.isArray(data.choices)) {
    const message = openRouterErrorMessage(data);
    throw new Error(message ? `OpenRouter: ${message}` : "OpenRouter non ha restituito choices");
  }
  const choices = asArray(data.choices, "choices");
  const choice = choices[0];
  const message = asRecord(asRecord(choice, "choices[0]").message, "choices[0].message");
  const content = messageContentToText(message.content ?? message.reasoning);
  const annotationText = messageAnnotationsToText(message.annotations);
  let parsed: Partial<VisuraExtractionResult> = {};
  if (content) {
    try {
      parsed = parseJsonRecord(content, "contenuto OpenRouter") as Partial<VisuraExtractionResult>;
    } catch (error) {
      if (!annotationText) throw error;
    }
  }
  return validateVisuraExtractionResult(parsed, [annotationText, content].filter(Boolean).join("\n"));
}

function validateVisuraExtractionResult(value: Partial<VisuraExtractionResult>, sourceText = ""): VisuraExtractionResult {
  const fallback = extractFromVisuraText(sourceText);
  const comune = formatComuneName(optionalString(value.comune) ?? fallback.comune);
  const provincia = normalizeProvince(optionalString(value.provincia) ?? fallback.provincia);
  const foglio = normalizeIdentifier(optionalString(value.foglio) ?? fallback.foglio);
  const particella = normalizeIdentifier(optionalString(value.particella) ?? fallback.particella);
  const hasAllFields = Boolean(comune && provincia && foglio && particella);
  const hasModelFields = Boolean(value.provincia || value.comune || value.foglio || value.particella);
  const found = Boolean(hasAllFields && (value.found === true || fallback.found || hasModelFields));
  const confidence =
    typeof value.confidence === "number" && Number.isFinite(value.confidence)
      ? Math.max(0, Math.min(1, value.confidence))
      : 0;
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  const evidence =
    optionalString(value.evidence) ??
    (fallback.evidence ? `Dati letti dal testo OCR: ${fallback.evidence}` : null);
  return {
    found,
    provincia,
    comune,
    foglio,
    particella,
    confidence: fallback.found && found ? Math.max(confidence, 0.9) : confidence,
    evidence,
    warnings,
  };
}

function extractFromVisuraText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const comune = normalized.match(/Comune\s+di\s+(.+?)(?:\s+\(Codice:|\s+Provincia\s+di|\s+Catasto\s+)/i)?.[1];
  const provincia = normalized.match(/Provincia\s+di\s+([A-ZÀ-Ü' -]+?)(?:\s+Catasto\s+|\s+Sez\.|\s+Foglio:|$)/i)?.[1];
  const identificativi = normalized.match(/Foglio:\s*([A-Z0-9/-]+)\s+Particella:\s*([A-Z0-9/-]+)/i);
  return {
    found: Boolean(comune && provincia && identificativi),
    comune: optionalString(comune),
    provincia: optionalString(provincia),
    foglio: optionalString(identificativi?.[1]),
    particella: optionalString(identificativi?.[2]),
    evidence:
      comune && provincia && identificativi
        ? `Comune di ${comune}; Provincia di ${provincia}; Foglio ${identificativi[1]}; Particella ${identificativi[2]}`
        : null,
  };
}

function scoreExtraction(value: VisuraExtractionResult) {
  return Number(Boolean(value.found)) + [value.provincia, value.comune, value.foglio, value.particella].filter(Boolean).length;
}

function normalizeIdentifier(value?: string) {
  return value?.trim().replace(/\s+/g, " ") || null;
}

function formatComuneName(value?: string | null) {
  const clean = value?.replace(/\s*\(Codice:.*$/i, "").trim();
  if (!clean) return null;
  return clean
    .toLocaleLowerCase("it-IT")
    .replace(/(^|[\s'-])(\p{L})/gu, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("it-IT")}`);
}

function normalizeProvince(value?: string | null) {
  const clean = optionalString(value);
  if (!clean) return null;
  const code = clean.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  const normalized = normalizeTerritory(clean);
  return PROVINCE_CODES_BY_NAME[normalized] ?? code;
}

function normalizeTerritory(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function messageContentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

function messageAnnotationsToText(annotations: unknown) {
  return collectTextParts(annotations).join("\n").trim();
}

function collectTextParts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectTextParts);
  const record = value as JsonRecord;
  const current = record.type === "text" && typeof record.text === "string" ? [record.text] : [];
  return current.concat(...["content", "file", "message"].map((key) => collectTextParts(record[key])));
}

function parseJsonRecord(value: string, label: string): JsonRecord {
  try {
    return JSON.parse(value) as JsonRecord;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`${label} non contiene JSON valido`);
    return JSON.parse(match[0]) as JsonRecord;
  }
}

function asRecord(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException(`${path} deve essere un oggetto`);
  }
  return value as JsonRecord;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    const message = openRouterErrorMessage(value);
    throw new Error(message ? `OpenRouter: ${message}` : `${path} deve essere una lista`);
  }
  return value;
}

function openRouterErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as JsonRecord;
  const error = record.error;
  if (!error || typeof error !== "object") return null;
  const errorRecord = error as JsonRecord;
  return optionalString(errorRecord.message) ?? optionalString(errorRecord.detail) ?? optionalString(errorRecord.code);
}

function optionalString(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

function optionalConfig(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function positiveIntegerConfig(value?: string) {
  const raw = optionalConfig(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const PROVINCE_CODES_BY_NAME: Record<string, string> = {
  agrigento: "AG",
  alessandria: "AL",
  ancona: "AN",
  arezzo: "AR",
  "ascoli piceno": "AP",
  bari: "BA",
  bergamo: "BG",
  bologna: "BO",
  bolzano: "BZ",
  brescia: "BS",
  cagliari: "CA",
  caltanissetta: "CL",
  campobasso: "CB",
  caserta: "CE",
  catania: "CT",
  como: "CO",
  cuneo: "CN",
  ferrara: "FE",
  firenze: "FI",
  genova: "GE",
  gorizia: "GO",
  grosseto: "GR",
  latina: "LT",
  lecco: "LC",
  livorno: "LI",
  lodi: "LO",
  lucca: "LU",
  macerata: "MC",
  mantova: "MN",
  "massa carrara": "MS",
  matera: "MT",
  messina: "ME",
  milano: "MI",
  modena: "MO",
  napoli: "NA",
  novara: "NO",
  padova: "PD",
  palermo: "PA",
  parma: "PR",
  pavia: "PV",
  perugia: "PG",
  "pesaro e urbino": "PU",
  pisa: "PI",
  pistoia: "PT",
  pordenone: "PN",
  potenza: "PZ",
  prato: "PO",
  "reggio calabria": "RC",
  "reggio emilia": "RE",
  roma: "RM",
  rovigo: "RO",
  sassari: "SS",
  savona: "SV",
  siena: "SI",
  siracusa: "SR",
  sondrio: "SO",
  teramo: "TE",
  terni: "TR",
  torino: "TO",
  treviso: "TV",
  trieste: "TS",
  udine: "UD",
  varese: "VA",
  venezia: "VE",
  verona: "VR",
  vicenza: "VI",
};
