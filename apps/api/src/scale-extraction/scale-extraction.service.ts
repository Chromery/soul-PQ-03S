import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
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
  apply_active_scale?: boolean;
};

type EnqueueDocumentPdfInput = {
  propertyId: string;
  documentId: string;
  fileName: string;
  fileBase64: string;
  sha256?: string;
};

type PageScaleExtractionResult = {
  page_number: number;
  found: boolean;
  scale_denominator: number | null;
  scale_label: string | null;
  sheet_size: "A3" | "A4" | null;
  confidence: number;
  evidence: string | null;
  warnings: string[];
};

type ScaleExtractionResult = PageScaleExtractionResult & {
  pages: PageScaleExtractionResult[];
};

type PdfScaleSource = {
  fileName: string;
  fileBuffer: Buffer;
  sizeBytes: number;
};

type RenderedPdfPage = {
  pageNumber: number;
  imageDataUrl: string;
  detailImages: Array<{
    label: string;
    imageDataUrl: string;
  }>;
  sheetSize: "A3" | "A4" | null;
};

const execFileAsync = promisify(execFile);
const DEFAULT_SCALE_MODEL = "qwen3.6-35b-fast";
const DEFAULT_NEURALWATT_API_URL = "https://api.neuralwatt.com/v1/chat/completions";
const DEFAULT_RENDER_DPI = 180;
const DEFAULT_MAX_PAGES = 24;
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;

@Injectable()
export class ScaleExtractionService {
  private readonly model: string;
  private readonly neuralwattApiUrl: string;
  private readonly renderDpi: number;
  private readonly maxPages: number;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.model = optionalConfig(config.get<string>("NEURALWATT_SCALE_MODEL")) ?? DEFAULT_SCALE_MODEL;
    this.neuralwattApiUrl =
      optionalConfig(config.get<string>("NEURALWATT_API_URL")) ?? DEFAULT_NEURALWATT_API_URL;
    this.renderDpi = integerConfig(
      config.get<string>("NEURALWATT_SCALE_RENDER_DPI"),
      DEFAULT_RENDER_DPI,
      120,
      300,
    );
    this.maxPages = integerConfig(
      config.get<string>("NEURALWATT_SCALE_MAX_PAGES"),
      DEFAULT_MAX_PAGES,
      1,
      100,
    );
    this.requestTimeoutMs = integerConfig(
      config.get<string>("NEURALWATT_SCALE_TIMEOUT_MS"),
      DEFAULT_REQUEST_TIMEOUT_MS,
      5_000,
      120_000,
    );
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
    const { buffer, sha256 } = decodePdfBase64(input.file_base64, input.file_name);
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

    const process = this.runJob(
      job.id,
      {
        fileName: input.file_name,
        fileBuffer: buffer,
        sizeBytes: buffer.byteLength,
      },
      { forceActiveScale: input.apply_active_scale === true },
    );
    if (wait) await process;
    else void process.catch((error) => console.error("Scale extraction job failed", error));

    return this.getJob(propertyId, job.id);
  }

  async enqueueDocumentPdf(input: EnqueueDocumentPdfInput) {
    const { buffer, sha256 } = decodePdfBase64(input.fileBase64, input.fileName);
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
      fileBuffer: buffer,
      sizeBytes: buffer.byteLength,
    });
    void process.catch((error) => console.error("Scale extraction job failed", error));
    return this.toApiJob(job);
  }

  private async runJob(
    jobId: string,
    source: PdfScaleSource,
    options: { forceActiveScale?: boolean } = {},
  ) {
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
      const updatedJob = await this.prisma.scaleExtractionJob.update({
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
      if (result.found && result.scale_denominator) {
        await this.persistDetectedScale(updatedJob.propertyId, result, completedAt, options);
      }
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

  private async extractScale(source: PdfScaleSource): Promise<ScaleExtractionResult> {
    const renderedPages = await renderPdfPages(source, this.renderDpi, this.maxPages);
    const pages: PageScaleExtractionResult[] = [];
    for (const page of renderedPages) {
      let primary: PageScaleExtractionResult;
      try {
        primary = parseNeuralwattPageExtraction(
          await this.callNeuralwattScaleExtraction(page, false),
          page,
        );
      } catch (error) {
        primary = parseNeuralwattPageExtraction(
          await this.callNeuralwattScaleExtraction(page, true),
          page,
        );
        primary.warnings = [
          ...primary.warnings,
          error instanceof Error
            ? `Primo tentativo non riuscito: ${error.message}`
            : "Primo tentativo non riuscito",
        ];
      }
      if (!primary.found && primary.confidence === 0 && !primary.evidence) {
        try {
          const retry = parseNeuralwattPageExtraction(
            await this.callNeuralwattScaleExtraction(page, true),
            page,
          );
          if (retry.found || retry.evidence || retry.confidence > primary.confidence) {
            primary = retry;
          }
        } catch (error) {
          primary.warnings = [
            ...primary.warnings,
            error instanceof Error
              ? `Secondo tentativo non riuscito: ${error.message}`
              : "Secondo tentativo non riuscito",
          ];
        }
      }
      pages.push(primary);
    }
    const primary = pages.find((page) => page.found) ?? pages[0];
    if (!primary) throw new Error("Il PDF non contiene pagine renderizzabili");
    return { ...primary, pages };
  }

  private async callNeuralwattScaleExtraction(
    page: RenderedPdfPage,
    retry: boolean,
  ) {
    const apiKey = optionalConfig(this.config.get<string>("NEURALWATT_API_KEY"));
    if (!apiKey || apiKey.includes("REPLACE_")) {
      throw new InternalServerErrorException("NEURALWATT_API_KEY non configurata per estrazione scala");
    }

    const primaryViews = page.detailImages.filter((view) =>
      view.label === "margine superiore"
      || view.label === "margine inferiore"
      || view.label === "margine sinistro, ruotato 90 gradi"
      || view.label === "margine sinistro, ruotato 270 gradi",
    );
    const retryViews = page.detailImages.filter((view) =>
      view.label === "margine destro"
      || view.label === "margine destro, ruotato 90 gradi"
      || view.label === "margine destro, ruotato 270 gradi",
    );
    const imageViews =
      !retry && primaryViews.length > 0
        ? primaryViews.slice(0, 4)
        : [
            { label: "pagina completa", imageDataUrl: page.imageDataUrl },
            ...retryViews,
          ].slice(0, 4);
    const content: JsonRecord[] = [
      {
        type: "text",
        text:
          `Analizza la pagina ${page.pageNumber}. Cerca una dicitura nel formato 'Scala 1:N', dove N è il denominatore da trascrivere. ` +
          "Devi accettare SOLO un denominatore adiacente alla parola 'Scala': ignora completamente tutti gli altri numeri nel disegno, anche se sembrano denominatori plausibili. La dicitura può essere piccola, verticale o ruotata: esamina mentalmente ogni vista a 0, 90, 180 e 270 gradi. Le immagini successive sono viste della stessa pagina, non pagine diverse. La frase di footer 'Fattore di scala non utilizzabile' riguarda il fattore del file e non annulla una diversa dicitura stampata 'Scala 1:N'. Se non trovi la parola 'Scala' con il rapporto accanto, usa found=false e valori null. Copia in evidence la dicitura esatta letta. " +
          `Il formato fisico della pagina PDF rilevato dai metadati è ${page.sheetSize ?? "non determinato"}; non provare a ricavare la scala da questo dato. ` +
          "Restituisci esattamente questi campi: {\"found\":boolean,\"scale_denominator\":number|null,\"scale_label\":string|null,\"sheet_size\":\"A3\"|\"A4\"|null,\"confidence\":number,\"evidence\":string|null,\"warnings\":string[]}." +
          (retry
            ? " Questo è un secondo tentativo: verifica prima i margini della tavola e poi il cartiglio, ruotando mentalmente l'immagine."
            : ""),
      },
    ];
    imageViews.forEach((view) => {
      content.push(
        { type: "text", text: `Vista: ${view.label}` },
        { type: "image_url", image_url: { url: view.imageDataUrl } },
      );
    });

    const payload: JsonRecord = {
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "Sei un tecnico catastale. Devi leggere la scala esplicita stampata in una singola pagina di una planimetria o di un elaborato planimetrico italiano. Accetta il denominatore solo quando appartiene alla stessa etichetta che contiene la parola 'Scala'. Non dedurre mai la scala da particelle, subalterni, quote, protocolli o altri numeri presenti nel disegno. Rispondi esclusivamente con un oggetto JSON valido, senza testo introduttivo.",
        },
        {
          role: "user",
          content,
        },
      ],
      temperature: 0,
      max_tokens: 900,
    };

    const response = await fetch(this.neuralwattApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(`NeuralWatt HTTP ${response.status}: ${safeProviderError(rawBody)}`);
    }
    return rawBody;
  }

  private async requireProperty(propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
    if (!property) throw new NotFoundException("Immobile non trovato");
    return property;
  }

  private async persistDetectedScale(
    propertyId: string,
    result: ScaleExtractionResult,
    detectedAt: Date,
    options: { forceActiveScale?: boolean } = {},
  ) {
    const denominator = result.scale_denominator;
    if (!denominator) return;
    await this.prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: propertyId },
        select: {
          id: true,
          sheetSize: true,
          scaleDenominator: true,
          scaleSource: true,
          aiScaleDenominator: true,
        },
      });
      if (!property) return;

      const effectivePropertyScaleSource =
        property.scaleSource === "USER" && !property.aiScaleDenominator ? "DEFAULT" : property.scaleSource;
      const shouldSeedActiveScale =
        result.confidence >= 0.5
        && (options.forceActiveScale === true || !isUserScaleSource(effectivePropertyScaleSource));
      await tx.property.update({
        where: { id: propertyId },
        data: {
          ...(shouldSeedActiveScale
            ? {
                sheetSize: result.sheet_size ?? property.sheetSize,
                scaleDenominator: denominator,
                scaleSource: "AI",
              }
            : {}),
          aiScaleDenominator: denominator,
          aiScaleLabel: result.scale_label,
          aiSheetSize: result.sheet_size,
          aiScaleConfidence: result.confidence,
          aiScaleDetectedAt: detectedAt,
        },
      });

      const draft = await tx.planAnalysisDraft.findUnique({
        where: { propertyId },
        select: {
          sheetSize: true,
          scaleSource: true,
          aiScaleDenominator: true,
          payload: true,
        },
      });
      if (!draft) return;

      const draftPayload =
        draft.payload && typeof draft.payload === "object" && !Array.isArray(draft.payload)
          ? (draft.payload as Record<string, unknown>)
          : {};
      const payloadHasScaleSource = typeof draftPayload.scaleSource === "string";
      const draftScaleSource = payloadHasScaleSource
        ? draft.scaleSource
        : draft.scaleSource === "USER"
          ? "DEFAULT"
          : draft.scaleSource;
      const effectiveDraftScaleSource =
        draftScaleSource === "USER" && !draft.aiScaleDenominator ? "DEFAULT" : draftScaleSource;
      const canSeedDraftScale =
        options.forceActiveScale === true || !isUserScaleSource(effectiveDraftScaleSource);
      const shouldSeedDraftScale = result.confidence >= 0.5 && canSeedDraftScale;
      await tx.planAnalysisDraft.update({
        where: { propertyId },
        data: {
          ...(shouldSeedDraftScale
            ? {
                sheetSize: result.sheet_size ?? draft.sheetSize,
                scaleDenominator: denominator,
                scaleSource: "AI",
              }
            : {}),
          aiScaleDenominator: denominator,
          aiScaleLabel: result.scale_label,
          aiSheetSize: result.sheet_size,
          aiScaleConfidence: result.confidence,
          aiScaleDetectedAt: detectedAt,
          payload: buildDraftPayloadWithDetectedScale(
            draft.payload,
            result,
            detectedAt,
            canSeedDraftScale,
            options.forceActiveScale === true,
          ),
        },
      });
    });
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
      apply_active_scale: optionalBoolean(input.apply_active_scale),
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
      pageScales: apiPageScalesFromRaw(job.rawResponse),
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

async function renderPdfPages(
  source: PdfScaleSource,
  dpi: number,
  maxPages: number,
): Promise<RenderedPdfPage[]> {
  if (source.sizeBytes <= 0 || source.fileBuffer.byteLength === 0) {
    throw new Error(`PDF vuoto: ${source.fileName}`);
  }
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "soul-scale-"));
  const pdfPath = path.join(temporaryDirectory, "source.pdf");
  const outputPrefix = path.join(temporaryDirectory, "page");
  try {
    await fs.writeFile(pdfPath, source.fileBuffer);
    const basicInfo = await execFileAsync("pdfinfo", [pdfPath], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const pageCount = pdfPageCount(String(basicInfo.stdout));
    if (pageCount < 1) throw new Error(`Nessuna pagina trovata in ${source.fileName}`);
    if (pageCount > maxPages) {
      throw new Error(
        `${source.fileName} contiene ${pageCount} pagine; il limite configurato è ${maxPages}`,
      );
    }

    const detailedInfo = await execFileAsync(
      "pdfinfo",
      ["-f", "1", "-l", String(pageCount), pdfPath],
      {
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const pageMetadata = pdfPageMetadata(String(detailedInfo.stdout));
    await execFileAsync(
      "pdftoppm",
      [
        "-f",
        "1",
        "-l",
        String(pageCount),
        "-r",
        String(dpi),
        "-jpeg",
        "-jpegopt",
        "quality=88,optimize=y",
        pdfPath,
        outputPrefix,
      ],
      {
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    const renderedFiles = (await fs.readdir(temporaryDirectory))
      .map((fileName) => ({
        fileName,
        pageNumber: Number(fileName.match(/^page-(\d+)\.jpg$/)?.[1] ?? 0),
      }))
      .filter((entry) => entry.pageNumber > 0)
      .sort((left, right) => left.pageNumber - right.pageNumber);
    if (renderedFiles.length !== pageCount) {
      throw new Error(
        `Rendering incompleto di ${source.fileName}: ${renderedFiles.length}/${pageCount} pagine`,
      );
    }

    const pages: RenderedPdfPage[] = [];
    for (const { fileName, pageNumber } of renderedFiles) {
      const imagePath = path.join(temporaryDirectory, fileName);
      const image = await fs.readFile(imagePath);
      const metadata = pageMetadata.get(pageNumber);
      const detailImages = metadata
        ? await renderJpegMarginCrops(
            imagePath,
            temporaryDirectory,
            pageNumber,
            metadata.widthPoints,
            metadata.heightPoints,
            dpi,
          )
        : [];
      pages.push({
        pageNumber,
        imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
        detailImages,
        sheetSize: metadata?.sheetSize ?? null,
      });
    }
    return pages;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function pdfPageCount(info: string) {
  const count = Number(info.match(/^Pages:\s+(\d+)$/im)?.[1] ?? 0);
  return Number.isInteger(count) ? count : 0;
}

function pdfPageMetadata(info: string) {
  const pages = new Map<
    number,
    { widthPoints: number; heightPoints: number; sheetSize: "A3" | "A4" | null }
  >();
  const pagePattern =
    /^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts(?:\s+\(([^)]+)\))?/gim;
  for (const match of info.matchAll(pagePattern)) {
    const pageNumber = Number(match[1]);
    const widthPoints = Number(match[2]);
    const heightPoints = Number(match[3]);
    if (pageNumber > 0 && widthPoints > 0 && heightPoints > 0) {
      pages.set(pageNumber, {
        widthPoints,
        heightPoints,
        sheetSize: sheetSizeFromPdfInfo(widthPoints, heightPoints, match[4]),
      });
    }
  }
  if (pages.size === 0) {
    const singlePage = info.match(
      /^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts(?:\s+\(([^)]+)\))?/im,
    );
    const widthPoints = Number(singlePage?.[1] ?? 0);
    const heightPoints = Number(singlePage?.[2] ?? 0);
    if (widthPoints > 0 && heightPoints > 0) {
      pages.set(1, {
        widthPoints,
        heightPoints,
        sheetSize: sheetSizeFromPdfInfo(widthPoints, heightPoints, singlePage?.[3]),
      });
    }
  }
  return pages;
}

function sheetSizeFromPdfInfo(
  widthPoints: number,
  heightPoints: number,
  label?: string,
): "A3" | "A4" | null {
  const normalizedLabel = label?.trim().toUpperCase();
  if (normalizedLabel === "A3" || normalizedLabel === "A4") return normalizedLabel;
  const shortEdge = Math.min(widthPoints, heightPoints);
  const longEdge = Math.max(widthPoints, heightPoints);
  if (Math.abs(shortEdge - 595) <= 25 && Math.abs(longEdge - 842) <= 35) return "A4";
  if (Math.abs(shortEdge - 842) <= 35 && Math.abs(longEdge - 1_191) <= 50) return "A3";
  return null;
}

async function renderJpegMarginCrops(
  imagePath: string,
  temporaryDirectory: string,
  pageNumber: number,
  widthPoints: number,
  heightPoints: number,
  dpi: number,
) {
  const width = Math.max(1, Math.round((widthPoints / 72) * dpi));
  const height = Math.max(1, Math.round((heightPoints / 72) * dpi));
  const aligned = (value: number) => Math.max(0, Math.floor(value / 16) * 16);
  const edgeWidth = Math.max(16, aligned(width * 0.32));
  const edgeHeight = Math.max(16, aligned(height * 0.32));
  const rightX = aligned(width - edgeWidth);
  const bottomY = aligned(height - edgeHeight);
  const crops = [
    { label: "margine sinistro", geometry: `${edgeWidth}x${height}+0+0` },
    { label: "margine destro", geometry: `${width - rightX}x${height}+${rightX}+0` },
    { label: "margine superiore", geometry: `${width}x${edgeHeight}+0+0` },
    { label: "margine inferiore", geometry: `${width}x${height - bottomY}+0+${bottomY}` },
  ];
  try {
    const baseCrops = await Promise.all(
      crops.map(async (crop, index) => {
        const outputPath = path.join(
          temporaryDirectory,
          `page-${pageNumber}-detail-${index + 1}.jpg`,
        );
        await execFileAsync(
          "jpegtran",
          [
            "-copy",
            "none",
            "-crop",
            crop.geometry,
            "-outfile",
            outputPath,
            imagePath,
          ],
          {
            timeout: 30_000,
            maxBuffer: 2 * 1024 * 1024,
          },
        );
        const image = await fs.readFile(outputPath);
        return {
          outputPath,
          label: crop.label,
          imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
        };
      }),
    );
    const rotatedVerticalCrops = await Promise.all(
      baseCrops.slice(0, 2).flatMap((crop, cropIndex) =>
        [90, 270].map(async (rotation) => {
          const outputPath = path.join(
            temporaryDirectory,
            `page-${pageNumber}-detail-${cropIndex + 1}-rotate-${rotation}.jpg`,
          );
          await execFileAsync(
            "jpegtran",
            [
              "-copy",
              "none",
              "-rotate",
              String(rotation),
              "-outfile",
              outputPath,
              crop.outputPath,
            ],
            {
              timeout: 30_000,
              maxBuffer: 2 * 1024 * 1024,
            },
          );
          const image = await fs.readFile(outputPath);
          return {
            label: `${crop.label}, ruotato ${rotation} gradi`,
            imageDataUrl: `data:image/jpeg;base64,${image.toString("base64")}`,
          };
        }),
      ),
    );
    return [
      ...baseCrops.map(({ label, imageDataUrl }) => ({ label, imageDataUrl })),
      ...rotatedVerticalCrops,
    ];
  } catch {
    return [];
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
  };
}

function parseNeuralwattPageExtraction(rawBody: string, page: RenderedPdfPage) {
  const data = parseJsonRecord(rawBody, "risposta NeuralWatt");
  if (!Array.isArray(data.choices)) {
    const message = providerErrorMessage(data);
    throw new Error(message ? `NeuralWatt: ${message}` : "NeuralWatt non ha restituito choices");
  }
  const choices = asArray(data.choices, "choices");
  const choice = choices[0];
  const message = asRecord(asRecord(choice, "choices[0]").message, "choices[0].message");
  const content = messageContentToText(
    message.content ?? message.reasoning_content ?? message.reasoning,
  );
  if (!content) throw new Error("NeuralWatt non ha restituito contenuto");
  const parsed = parseJsonRecord(content, "contenuto NeuralWatt") as Partial<PageScaleExtractionResult>;
  const result = validatePageExtractionResult(parsed, "", page.pageNumber);
  return {
    ...result,
    page_number: page.pageNumber,
    sheet_size: page.sheetSize ?? result.sheet_size,
  };
}

function validateExtractionResult(value: Partial<ScaleExtractionResult>, sourceText = ""): ScaleExtractionResult {
  const pages = Array.isArray(value.pages)
    ? value.pages
        .map((page, index) => validatePageExtractionResult(page, "", index + 1))
        .sort((left, right) => left.page_number - right.page_number)
    : [];
  if (pages.length > 0) {
    const primary = pages.find((page) => page.found) ?? pages[0];
    return { ...primary, pages };
  }

  const legacy = validatePageExtractionResult(value, sourceText, 1);
  return { ...legacy, pages: [legacy] };
}

export function normalizeScaleExtractionResult(value: unknown) {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Partial<ScaleExtractionResult>
      : {};
  return validateExtractionResult(input);
}

function validatePageExtractionResult(
  value: Partial<PageScaleExtractionResult>,
  sourceText = "",
  fallbackPage = 1,
): PageScaleExtractionResult {
  const pageNumber =
    typeof value.page_number === "number"
    && Number.isInteger(value.page_number)
    && value.page_number >= 1
      ? value.page_number
      : fallbackPage;
  const found = typeof value.found === "boolean" ? value.found : false;
  const rawDenominator = (value as { scale_denominator?: unknown }).scale_denominator;
  const denominator =
    typeof rawDenominator === "string" ? Number(rawDenominator) : rawDenominator;
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
    page_number: pageNumber,
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

function isUserScaleSource(value: string | null | undefined) {
  return value === "USER" || value === "CALIBRATION";
}

function buildDraftPayloadWithDetectedScale(
  payload: unknown,
  result: ScaleExtractionResult,
  detectedAt: Date,
  seedActiveScale: boolean,
  forceActiveScale: boolean,
) {
  const base: Record<string, unknown> =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>) }
      : {};
  const existingPageScales =
    base.pageScales && typeof base.pageScales === "object" && !Array.isArray(base.pageScales)
      ? { ...(base.pageScales as Record<string, unknown>) }
      : {};
  const pageScales: Record<string, unknown> = { ...existingPageScales };
  result.pages.forEach((page) => {
    if (!page.found || !page.scale_denominator) return;
    const key = String(page.page_number);
    const existing =
      existingPageScales[key] && typeof existingPageScales[key] === "object"
      && !Array.isArray(existingPageScales[key])
        ? { ...(existingPageScales[key] as Record<string, unknown>) }
        : {};
    const existingSource =
      typeof existing.scaleSource === "string"
        ? existing.scaleSource
        : typeof base.scaleSource === "string"
          ? base.scaleSource
          : "DEFAULT";
    const shouldSeedPage =
      page.confidence >= 0.5
      && (forceActiveScale || (seedActiveScale && !isUserScaleSource(existingSource)));
    pageScales[key] = {
      ...existing,
      ...(shouldSeedPage
        ? {
            sheetSize:
              page.sheet_size
              ?? (existing.sheetSize === "A3" || existing.sheetSize === "A4"
                ? existing.sheetSize
                : base.sheetSize === "A4" ? "A4" : "A3"),
            scaleDenominator: page.scale_denominator,
            scaleSource: "AI",
            calibration: null,
          }
        : {}),
      aiScaleDenominator: page.scale_denominator,
      aiScaleLabel: page.scale_label,
      aiSheetSize: page.sheet_size,
      aiScaleConfidence: page.confidence,
      aiScaleDetectedAt: detectedAt.toISOString(),
    };
  });
  return {
    ...base,
    ...(seedActiveScale
      ? {
          sheetSize: result.sheet_size ?? (typeof base.sheetSize === "string" ? base.sheetSize : "A3"),
          scaleDenominator: result.scale_denominator,
          scaleSource: "AI",
        }
      : {}),
    aiScaleDenominator: result.scale_denominator,
    aiScaleLabel: result.scale_label,
    aiSheetSize: result.sheet_size,
    aiScaleConfidence: result.confidence,
    aiScaleDetectedAt: detectedAt.toISOString(),
    pageScales,
  } as Prisma.InputJsonValue;
}

function apiPageScalesFromRaw(rawResponse: unknown) {
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) return [];
  const pages = (rawResponse as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return [];
  return pages.map((value, index) => {
    const page = validatePageExtractionResult(
      value && typeof value === "object" && !Array.isArray(value)
        ? value as Partial<PageScaleExtractionResult>
        : {},
      "",
      index + 1,
    );
    return {
      page: page.page_number,
      scale: page.found && page.scale_denominator
        ? {
            denominator: page.scale_denominator,
            label: page.scale_label ?? `1:${page.scale_denominator}`,
            sheetSize: page.sheet_size,
          }
        : null,
      confidence: page.confidence,
      evidence: page.evidence,
      warnings: page.warnings,
    };
  });
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
    const message = providerErrorMessage(value);
    throw new Error(message ? `Provider AI: ${message}` : `${path} deve essere una lista`);
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

function providerErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as JsonRecord;
  const error = record.error;
  if (!error || typeof error !== "object") return null;
  const errorRecord = error as JsonRecord;
  return optionalString(errorRecord.message) ?? optionalString(errorRecord.detail) ?? optionalString(errorRecord.code);
}

function safeProviderError(rawBody: string) {
  try {
    return providerErrorMessage(JSON.parse(rawBody)) ?? rawBody.slice(0, 500);
  } catch {
    return rawBody.slice(0, 500);
  }
}

function optionalString(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

function optionalBoolean(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
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

function integerConfig(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}
