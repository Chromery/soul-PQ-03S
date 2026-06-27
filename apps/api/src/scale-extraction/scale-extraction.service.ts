import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { ScaleExtractionStatus } from "../generated/prisma/enums.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

type JsonRecord = Record<string, unknown>;

type CreateScaleExtractionInput = {
  file_name: string;
  file_base64: string;
  mime_type?: string;
  document_id?: string;
  sha256?: string;
};

type EnqueueDocumentPdfInput = {
  propertyId: string;
  documentId: string;
  fileName: string;
  fileBase64: string;
  sha256?: string;
};

type ScaleExtractionResult = {
  found: boolean;
  scale_denominator: number | null;
  scale_label: string | null;
  sheet_size: "A3" | "A4" | null;
  confidence: number;
  evidence: string | null;
  warnings: string[];
};

const DEFAULT_SCALE_MODEL = "qwen/qwen3.5-flash-02-23";

const SCALE_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "found",
    "scale_denominator",
    "scale_label",
    "sheet_size",
    "confidence",
    "evidence",
    "warnings",
  ],
  properties: {
    found: { type: "boolean" },
    scale_denominator: {
      anyOf: [{ type: "integer", minimum: 20, maximum: 20000 }, { type: "null" }],
    },
    scale_label: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    sheet_size: {
      anyOf: [{ type: "string", enum: ["A3", "A4"] }, { type: "null" }],
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
export class ScaleExtractionService {
  private readonly model: string;
  private readonly siteUrl: string;
  private readonly appTitle: string;
  private readonly pdfEngine: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.model = optionalConfig(config.get<string>("OPENROUTER_SCALE_MODEL")) ?? DEFAULT_SCALE_MODEL;
    this.siteUrl = optionalConfig(config.get<string>("OPENROUTER_SITE_URL")) ?? "http://localhost:8080";
    this.appTitle = optionalConfig(config.get<string>("OPENROUTER_APP_TITLE")) ?? "Soul Prospect Qualifier";
    this.pdfEngine = optionalConfig(config.get<string>("OPENROUTER_PDF_ENGINE")) ?? "mistral-ocr";
  }

  async getJobs(propertyId: string) {
    await this.requireProperty(propertyId);
    const jobs = await this.prisma.scaleExtractionJob.findMany({
      where: { propertyId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return jobs.map((job) => this.toApiJob(job));
  }

  async getLatestJob(propertyId: string) {
    await this.requireProperty(propertyId);
    const job = await this.prisma.scaleExtractionJob.findFirst({
      where: { propertyId },
      orderBy: { createdAt: "desc" },
    });
    return job ? this.toApiJob(job) : null;
  }

  async getJob(propertyId: string, jobId: string) {
    await this.requireProperty(propertyId);
    const job = await this.prisma.scaleExtractionJob.findFirst({
      where: { id: jobId, propertyId },
    });
    if (!job) throw new NotFoundException("Job di estrazione scala non trovata");
    return this.toApiJob(job);
  }

  async createFromBase64(propertyId: string, body: unknown, wait = false) {
    await this.requireProperty(propertyId);
    const input = this.validateCreateInput(body);
    const { buffer, sha256, dataUrl } = decodePdfBase64(input.file_base64, input.file_name);
    if (input.sha256 && input.sha256.toLowerCase() !== sha256) {
      throw new BadRequestException(`SHA256 non coerente per ${input.file_name}`);
    }

    const job = await this.prisma.scaleExtractionJob.create({
      data: {
        propertyId,
        documentId: input.document_id,
        status: ScaleExtractionStatus.PENDING,
        model: this.model,
        sourceFileName: input.file_name,
        sourceSha256: sha256,
      },
    });

    const process = this.runJob(job.id, {
      fileName: input.file_name,
      fileData: dataUrl,
      sizeBytes: buffer.byteLength,
    });
    if (wait) await process;
    else void process.catch((error) => console.error("Scale extraction job failed", error));

    return this.getJob(propertyId, job.id);
  }

  async enqueueDocumentPdf(input: EnqueueDocumentPdfInput) {
    const { buffer, sha256, dataUrl } = decodePdfBase64(input.fileBase64, input.fileName);
    if (input.sha256 && input.sha256.toLowerCase() !== sha256) {
      throw new BadRequestException(`SHA256 non coerente per ${input.fileName}`);
    }

    const job = await this.prisma.scaleExtractionJob.create({
      data: {
        propertyId: input.propertyId,
        documentId: input.documentId,
        status: ScaleExtractionStatus.PENDING,
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
    void process.catch((error) => console.error("Scale extraction job failed", error));
    return this.toApiJob(job);
  }

  private async runJob(jobId: string, source: { fileName: string; fileData: string; sizeBytes: number }) {
    const startedAt = new Date();
    await this.prisma.scaleExtractionJob.update({
      where: { id: jobId },
      data: {
        status: ScaleExtractionStatus.RUNNING,
        startedAt,
        errorMessage: null,
      },
    });

    try {
      const result = await this.extractScale(source);
      const completedAt = new Date();
      await this.prisma.scaleExtractionJob.update({
        where: { id: jobId },
        data: {
          status: ScaleExtractionStatus.SUCCEEDED,
          detectedScaleDenominator: result.found ? result.scale_denominator : null,
          detectedScaleLabel: result.scale_label,
          detectedSheetSize: result.sheet_size,
          confidence: result.confidence,
          evidence: result.evidence,
          warnings: result.warnings as unknown as Prisma.InputJsonValue,
          rawResponse: result as unknown as Prisma.InputJsonValue,
          completedAt,
        },
      });
    } catch (error) {
      const completedAt = new Date();
      await this.prisma.scaleExtractionJob.update({
        where: { id: jobId },
        data: {
          status: ScaleExtractionStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : "Errore sconosciuto",
          completedAt,
        },
      });
      throw error;
    }
  }

  private async extractScale(source: { fileName: string; fileData: string; sizeBytes: number }) {
    const primary = parseOpenRouterExtraction(await this.callOpenRouterScaleExtraction(source, false));
    if (!primary.found && primary.confidence === 0 && !primary.evidence) {
      try {
        const retry = parseOpenRouterExtraction(await this.callOpenRouterScaleExtraction(source, true));
        if (retry.found || retry.evidence || retry.confidence > primary.confidence) return retry;
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

  private async callOpenRouterScaleExtraction(
    source: { fileName: string; fileData: string; sizeBytes: number },
    retry: boolean,
  ) {
    const apiKey = optionalConfig(this.config.get<string>("OPENROUTER_API_KEY"));
    if (!apiKey || apiKey.includes("REPLACE_")) {
      throw new InternalServerErrorException("OPENROUTER_API_KEY non configurata per estrazione scala");
    }

    const payload: JsonRecord = {
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "Sei un tecnico catastale. Estrai solo scale esplicite da planimetrie PDF o elaborati planimetrici catastali. Se leggi una dicitura come 'Scala 1:500' o 'Scala 1 : 500' devi impostare found=true e scale_denominator=500. Rispondi esclusivamente JSON valido conforme allo schema.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analizza il PDF della planimetria catastale e trova il rapporto di scala, per esempio 'Scala 1:500', 'Scala 1 : 500', '1/200' o simili. Non inferire la scala dal formato foglio A3/A4. La dicitura 'Fattore di scala non utilizzabile' riguarda il fattore di stampa/acquisizione: non usarla come scala e non scartare un'altra dicitura esplicita come 'Scala 1:500'. Se non trovi una scala esplicita, usa found=false e valori null. Riporta in evidence il testo o la zona che giustifica la risposta." +
                (retry
                  ? " Questo e un secondo tentativo: controlla con attenzione il testo OCR e, se trovi una riga con 'Scala 1 : N', restituisci quella scala."
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
      seed: retry ? 43 : 42,
      max_tokens: 1500,
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
          name: "planimetria_scale_extraction",
          strict: true,
          schema: SCALE_EXTRACTION_SCHEMA,
        },
      };
      payload.provider = {
        require_parameters: true,
      };
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.siteUrl,
        "X-Title": this.appTitle,
      },
      body: JSON.stringify(payload),
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(`OpenRouter HTTP ${response.status}: ${rawBody.slice(0, 500)}`);
    }
    return rawBody;
  }

  private async requireProperty(propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
    if (!property) throw new NotFoundException("Immobile non trovato");
    return property;
  }

  private validateCreateInput(body: unknown): CreateScaleExtractionInput {
    const input = asRecord(body, "payload");
    const fileName = requiredString(input.file_name, "file_name");
    const fileBase64 = requiredString(input.file_base64, "file_base64");
    const mimeType = optionalString(input.mime_type) ?? "application/pdf";
    if (mimeType !== "application/pdf") throw new BadRequestException("mime_type deve essere application/pdf");
    return {
      file_name: fileName,
      file_base64: fileBase64,
      mime_type: mimeType,
      document_id: optionalString(input.document_id),
      sha256: optionalString(input.sha256),
    };
  }

  private toApiJob(job: {
    id: string;
    propertyId: string;
    documentId: string | null;
    status: ScaleExtractionStatus;
    model: string;
    sourceFileName: string;
    sourceSha256: string | null;
    detectedScaleDenominator: number | null;
    detectedScaleLabel: string | null;
    detectedSheetSize: string | null;
    confidence: unknown;
    evidence: string | null;
    warnings: unknown;
    rawResponse: unknown;
    errorMessage: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: job.id,
      propertyId: job.propertyId,
      documentId: job.documentId,
      status: job.status,
      model: job.model,
      sourceFileName: job.sourceFileName,
      sourceSha256: job.sourceSha256,
      scale: job.detectedScaleDenominator
        ? {
            denominator: job.detectedScaleDenominator,
            label: job.detectedScaleLabel ?? `1:${job.detectedScaleDenominator}`,
            sheetSize: job.detectedSheetSize,
          }
        : null,
      confidence: job.confidence === null || job.confidence === undefined ? null : Number(job.confidence),
      evidence: job.evidence,
      warnings: Array.isArray(job.warnings) ? job.warnings : [],
      rawResponse: job.rawResponse,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
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

function parseOpenRouterExtraction(rawBody: string) {
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
  let parsed: Partial<ScaleExtractionResult> = {};
  if (content) {
    try {
      parsed = parseJsonRecord(content, "contenuto OpenRouter") as Partial<ScaleExtractionResult>;
    } catch (error) {
      if (!annotationText) throw error;
    }
  }
  return validateExtractionResult(parsed, annotationText);
}

function validateExtractionResult(value: Partial<ScaleExtractionResult>, sourceText = ""): ScaleExtractionResult {
  const found = typeof value.found === "boolean" ? value.found : false;
  const denominator = value.scale_denominator;
  const scaleDenominator =
    typeof denominator === "number" && Number.isInteger(denominator) && denominator >= 20 && denominator <= 20000
      ? denominator
      : null;
  const sheetSize = value.sheet_size === "A3" || value.sheet_size === "A4" ? value.sheet_size : null;
  const confidence =
    typeof value.confidence === "number" && Number.isFinite(value.confidence)
      ? Math.max(0, Math.min(1, value.confidence))
      : 0;
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];
  const evidence = typeof value.evidence === "string" ? value.evidence : null;
  const label = typeof value.scale_label === "string" ? value.scale_label : null;
  const explicitDenominator = extractScaleDenominator([label, evidence, sourceText, ...warnings].join(" "));
  const inferredDenominator = scaleDenominator ?? explicitDenominator;
  const resultFound = Boolean((found && scaleDenominator !== null) || inferredDenominator);
  const inferredSheetSize = extractSheetSize(sourceText) ?? sheetSize;
  return {
    found: resultFound,
    scale_denominator: resultFound ? inferredDenominator : null,
    scale_label: label ?? (inferredDenominator ? `1:${inferredDenominator}` : null),
    sheet_size: inferredSheetSize,
    confidence: explicitDenominator ? Math.max(confidence, 0.9) : confidence,
    evidence: evidence ?? (explicitDenominator ? `Scala esplicita rilevata dal testo OCR: 1:${explicitDenominator}` : null),
    warnings: explicitDenominator
      ? warnings.filter((warning) => !/fattore di scala non utilizzabile/i.test(warning))
      : warnings,
  };
}

function extractScaleDenominator(text: string) {
  const match = text.match(new RegExp("(?:scala\\s*)?1\\s*(?::|/|a)\\s*(\\d{2,5})", "i"));
  if (!match) return null;
  const denominator = Number(match[1]);
  if (!Number.isInteger(denominator) || denominator < 20 || denominator > 20000) return null;
  return denominator;
}

function extractSheetSize(text: string): "A3" | "A4" | null {
  const requested = text.match(/Formato stampa richiesto:\s*(A[34])\s*\(/i)?.[1]?.toUpperCase();
  if (requested === "A3" || requested === "A4") return requested;
  const acquired = text.match(/Formato di acquisizione:\s*(A[34])\s*\(/i)?.[1]?.toUpperCase();
  if (acquired === "A3" || acquired === "A4") return acquired;
  const generic = text.match(/\b(A[34])\s*\(\s*\d+\s*x\s*\d+\s*\)/i)?.[1]?.toUpperCase();
  if (generic === "A3" || generic === "A4") return generic;
  return null;
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

function requiredString(value: unknown, path: string) {
  const result = optionalString(value);
  if (!result) throw new BadRequestException(`${path} obbligatorio`);
  return result;
}

function optionalConfig(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
