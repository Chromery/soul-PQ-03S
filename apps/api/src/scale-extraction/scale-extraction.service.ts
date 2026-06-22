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
    const apiKey = optionalConfig(this.config.get<string>("OPENROUTER_API_KEY"));
    if (!apiKey || apiKey.includes("REPLACE_")) {
      throw new InternalServerErrorException("OPENROUTER_API_KEY non configurata per estrazione scala");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": this.siteUrl,
        "X-Title": this.appTitle,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "Sei un tecnico catastale. Estrai solo scale esplicite da planimetrie PDF. Se leggi una dicitura come 'Scala 1:500' devi impostare found=true e scale_denominator=500. Rispondi esclusivamente JSON valido conforme allo schema.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Analizza il PDF della planimetria catastale e trova il rapporto di scala, per esempio 'Scala 1:500', '1/200' o simili. Non inferire la scala dal formato foglio A3/A4. La dicitura 'Fattore di scala non utilizzabile' significa che non c'e una scala affidabile. Se non trovi una scala esplicita, usa found=false e valori null. Riporta in evidence il testo o la zona che giustifica la risposta.",
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
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "planimetria_scale_extraction",
            strict: true,
            schema: SCALE_EXTRACTION_SCHEMA,
          },
        },
        temperature: 0,
        seed: 42,
        max_tokens: 1500,
        include_reasoning: false,
        reasoning: {
          exclude: true,
        },
        provider: {
          require_parameters: true,
        },
        plugins: [
          {
            id: "file-parser",
            pdf: {
              engine: this.pdfEngine,
            },
          },
        ],
      }),
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(`OpenRouter HTTP ${response.status}: ${rawBody.slice(0, 500)}`);
    }

    const data = parseJsonRecord(rawBody, "risposta OpenRouter");
    const choice = asArray(data.choices, "choices")[0];
    const message = asRecord(asRecord(choice, "choices[0]").message, "choices[0].message");
    const content = messageContentToText(message.content ?? message.reasoning);
    const parsed = parseJsonRecord(content, "contenuto OpenRouter") as Partial<ScaleExtractionResult>;
    return validateExtractionResult(parsed);
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

function validateExtractionResult(value: Partial<ScaleExtractionResult>): ScaleExtractionResult {
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
  const explicitDenominator = extractScaleDenominator([label, evidence, ...warnings].join(" "));
  const inferredDenominator = scaleDenominator ?? explicitDenominator;
  const resultFound = Boolean((found && scaleDenominator !== null) || inferredDenominator);
  return {
    found: resultFound,
    scale_denominator: resultFound ? inferredDenominator : null,
    scale_label: label ?? (inferredDenominator ? `1:${inferredDenominator}` : null),
    sheet_size: sheetSize,
    confidence: explicitDenominator ? Math.max(confidence, 0.9) : confidence,
    evidence,
    warnings,
  };
}

function extractScaleDenominator(text: string) {
  const match = text.match(new RegExp("(?:scala\\s*)?1\\s*(?::|/|a)\\s*(\\d{2,5})", "i"));
  if (!match) return null;
  const denominator = Number(match[1]);
  if (!Number.isInteger(denominator) || denominator < 20 || denominator > 20000) return null;
  return denominator;
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
  throw new Error("Risposta OpenRouter senza contenuto testuale");
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
  if (!Array.isArray(value)) throw new Error(`${path} deve essere una lista`);
  return value;
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
