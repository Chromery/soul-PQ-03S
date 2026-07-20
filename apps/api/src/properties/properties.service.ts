import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { documentTypePath, parseDocumentType } from "../document-types.js";
import { Prisma } from "../generated/prisma/client.js";
import { DocumentType } from "../generated/prisma/enums.js";
import { DocumentStorageService } from "../erp-sync/document-storage.service.js";
import { ImuService } from "../imu/imu.service.js";
import type { ImuCalculation } from "../imu/imu.types.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { estimatedRenditaFromAnalysisDraft, estimatedRenditaFromDraftPayload } from "../rendita.js";
import { VisuraExtractionService } from "../visura-extraction/visura-extraction.service.js";

type DraftPayload = {
  version: number;
  propertyId: string;
  document: unknown | null;
  savedAt: string;
  sheetSize: string;
  scaleDenominator: number;
  scaleSource?: string;
  aiScaleDenominator?: number | null;
  aiScaleLabel?: string | null;
  aiSheetSize?: string | null;
  aiScaleConfidence?: number | null;
  aiScaleDetectedAt?: string | null;
  totalArea?: number;
  totalEstimatedAmount?: number;
  totalEstimatedRendita?: number;
  totalBaseAmount?: number;
  totalLotArea?: number;
  totalLotValue?: number;
  lotValuation?: unknown;
  selections: unknown[];
};

type NormalizedDraftPayload = DraftPayload & {
  scaleSource: ScaleSource;
  aiScaleDenominator: number | null;
  aiScaleLabel: string | null;
  aiSheetSize: string | null;
  aiScaleConfidence: number | null;
  aiScaleDetectedAt: string | null;
  lotValuation: LotValuation;
};

type ScaleSource = "DEFAULT" | "AI" | "USER" | "CALIBRATION";

type LotValuation = {
  mode: "percentage" | "per_sqm";
  percentage: number;
  unitValuePerM2: number;
};

type DocumentUploadInput = {
  file_name: string;
  file_base64: string;
  mime_type?: string;
};

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly imu: ImuService,
    private readonly visuraExtraction: VisuraExtractionService,
  ) {}

  async getDraft(propertyId: string) {
    await this.requireProperty(propertyId);
    const draft = await this.prisma.planAnalysisDraft.findUnique({ where: { propertyId } });
    if (!draft) return null;
    const payload =
      typeof draft.payload === "object" && draft.payload !== null && !Array.isArray(draft.payload)
        ? (draft.payload as Record<string, unknown>)
        : {};
    const payloadHasScaleSource = typeof payload.scaleSource === "string";
    return {
      ...payload,
      scaleSource: payloadHasScaleSource
        ? normalizeScaleSource(payload.scaleSource)
        : normalizeScaleSource(draft.scaleSource === "USER" ? "DEFAULT" : draft.scaleSource),
      aiScaleDenominator: draft.aiScaleDenominator,
      aiScaleLabel: draft.aiScaleLabel,
      aiSheetSize: draft.aiSheetSize,
      aiScaleConfidence: draft.aiScaleConfidence === null ? null : Number(draft.aiScaleConfidence),
      aiScaleDetectedAt: draft.aiScaleDetectedAt?.toISOString() ?? null,
    };
  }

  async saveDraft(propertyId: string, body: unknown) {
    const payload = this.validatePayload(propertyId, body);
    const property = await this.requireProperty(propertyId);
    const latestVersion = await this.prisma.studyVersion.findFirst({
      where: { studyId: property.studyId },
      orderBy: { versionNumber: "desc" },
    });
    const savedAt = new Date(payload.savedAt);
    const aiScaleDetectedAt = payload.aiScaleDetectedAt ? new Date(payload.aiScaleDetectedAt) : null;
    const totalEstimatedRendita = estimatedRenditaFromDraftPayload(payload);
    const currentImuCalculation = this.calculateImu(Number(property.currentRendita), property);
    const estimatedImuCalculation = totalEstimatedRendita === null
      ? null
      : this.calculateImu(totalEstimatedRendita, property);
    const currentImu = calculatedAmount(currentImuCalculation)
      ?? (property.currentImu === null ? null : Number(property.currentImu));
    const estimatedImu = estimatedImuCalculation === null ? null : calculatedAmount(estimatedImuCalculation);
    const data = {
      documentSource: (payload.document === null ? Prisma.JsonNull : payload.document) as Prisma.InputJsonValue,
      payload: payload as unknown as Prisma.InputJsonValue,
      sheetSize: payload.sheetSize,
      scaleDenominator: payload.scaleDenominator,
      scaleSource: payload.scaleSource,
      aiScaleDenominator: payload.aiScaleDenominator,
      aiScaleLabel: payload.aiScaleLabel,
      aiSheetSize: payload.aiSheetSize,
      aiScaleConfidence: payload.aiScaleConfidence,
      aiScaleDetectedAt,
      totalArea: payload.totalArea,
      totalEstimatedValue: totalEstimatedRendita ?? undefined,
      savedAt,
      studyVersionId: latestVersion?.id,
    };

    const draft = await this.prisma.$transaction(async (tx) => {
      const savedDraft = await tx.planAnalysisDraft.upsert({
        where: { propertyId },
        create: { propertyId, ...data },
        update: data,
      });
      await tx.property.update({
        where: { id: propertyId },
        data: {
          sheetSize: payload.sheetSize,
          scaleDenominator: payload.scaleDenominator,
          scaleSource: payload.scaleSource,
          aiScaleDenominator: payload.aiScaleDenominator,
          aiScaleLabel: payload.aiScaleLabel,
          aiSheetSize: payload.aiSheetSize,
          aiScaleConfidence: payload.aiScaleConfidence,
          aiScaleDetectedAt,
          ...(totalEstimatedRendita === null
            ? {}
            : {
                estimatedRendita: totalEstimatedRendita,
                diffPercent: percentageDiff(Number(property.currentRendita), totalEstimatedRendita),
                estimatedImu: estimatedImu ?? undefined,
                imuDiff: estimatedImu === null || currentImu === null ? undefined : estimatedImu - currentImu,
                hasStudy: true,
              }),
        },
      });
      return savedDraft;
    });
    await this.refreshStudyTotals(property.studyId);
    return {
      ...payload,
      estimatedImu,
      imuCalculation: estimatedImuCalculation,
    };
  }

  async updateProperty(propertyId: string, body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestException("Modifica immobile non valida");
    }
    const input = body as Record<string, unknown>;
    const hasOutcome = Object.prototype.hasOwnProperty.call(input, "outcome");
    const hasImuRateOverride = Object.prototype.hasOwnProperty.call(input, "imuRateOverride");
    if (!hasOutcome && !hasImuRateOverride) {
      throw new BadRequestException("Nessuna modifica immobile supportata");
    }
    const existing = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: { analysisDraft: true },
    });
    if (!existing) throw new NotFoundException("Immobile non trovato");
    const outcome = hasOutcome ? validatePropertyOutcome(input.outcome) : existing.outcome;
    const imuRateOverride = hasImuRateOverride
      ? validateImuRateOverride(input.imuRateOverride)
      : existing.imuRateOverride === null
        ? null
        : Number(existing.imuRateOverride);
    const property = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(hasOutcome ? { outcome } : {}),
        ...(hasImuRateOverride ? { imuRateOverride } : {}),
      },
    });
    if (!hasImuRateOverride) return { id: property.id, outcome: property.outcome };

    const calculationProperty = { ...property, imuRateOverride };
    const estimatedRendita = estimatedRenditaFromAnalysisDraft(existing.analysisDraft)
      ?? Number(property.estimatedRendita);
    const currentImuCalculation = this.calculateImu(Number(property.currentRendita), calculationProperty);
    const estimatedImuCalculation = estimatedRendita > 0 || property.hasStudy
      ? this.calculateImu(estimatedRendita, calculationProperty)
      : null;
    const currentImu = calculatedAmount(currentImuCalculation)
      ?? (property.currentImu === null ? null : Number(property.currentImu));
    const estimatedImu = calculatedAmount(estimatedImuCalculation)
      ?? (property.estimatedImu === null ? null : Number(property.estimatedImu));
    await this.refreshStudyTotals(property.studyId);
    return {
      id: property.id,
      outcome: property.outcome,
      imuRateOverride,
      currentImu,
      estimatedImu,
      imuDiff: currentImu === null || estimatedImu === null ? 0 : estimatedImu - currentImu,
      currentImuCalculation: currentImuCalculation.status === "calculated" ? currentImuCalculation : null,
      imuCalculation: estimatedImuCalculation,
      currentImuSource: currentImuCalculation.status === "calculated"
        ? "calculated"
        : property.currentImu === null ? "unavailable" : "stored",
      estimatedImuSource: estimatedImuCalculation?.status === "calculated"
        ? "calculated"
        : property.estimatedImu === null ? "unavailable" : "stored",
    };
  }

  async uploadDocument(propertyId: string, rawType: string, body: unknown) {
    const type = parseDocumentType(rawType);
    const property = await this.requireProperty(propertyId);
    const input = validateDocumentUploadInput(body);
    const previousDocument = await this.prisma.propertyDocument.findUnique({
      where: { propertyId_type: { propertyId, type } },
    });
    const stored = await this.storage.storeBase64Pdf({
      studioErpId: property.studyId,
      immobileErpId: property.id,
      tipo: documentTypePath(type),
      fileNome: input.file_name,
      fileBase64: input.file_base64,
    });
    const document = await this.prisma.propertyDocument.upsert({
      where: { propertyId_type: { propertyId, type } },
      create: {
        propertyId,
        type,
        erpDocumentId: null,
        fileName: input.file_name,
        storageKey: stored.storageKey,
        mimeType: input.mime_type ?? "application/pdf",
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
      },
      update: {
        fileName: input.file_name,
        storageKey: stored.storageKey,
        mimeType: input.mime_type ?? "application/pdf",
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
      },
    });
    if (
      previousDocument
      && previousDocument.storageKey !== document.storageKey
      && !previousDocument.storageKey.startsWith("demo/")
    ) {
      try {
        await this.storage.deleteObject(previousDocument.storageKey);
      } catch (error) {
        console.error("Impossibile eliminare il precedente documento sostituito", error);
      }
    }
    const visuraExtractionJob = type === DocumentType.VISURA
      ? await this.visuraExtraction.enqueueDocumentPdf({
        propertyId,
        documentId: document.id,
        fileName: input.file_name,
        fileBase64: input.file_base64,
        sha256: stored.sha256,
      })
      : null;

    return {
      id: document.id,
      propertyId,
      type: documentTypePath(type),
      fileName: document.fileName,
      mimeType: document.mimeType,
      sha256: document.sha256,
      sizeBytes: document.sizeBytes,
      visuraExtractionJob,
      downloadUrl: `/api/properties/${encodeURIComponent(propertyId)}/documents/${documentTypePath(type)}/download`,
    };
  }

  async openDocument(propertyId: string, rawType: string) {
    const type = parseDocumentType(rawType);
    await this.requireProperty(propertyId);
    let document = await this.prisma.propertyDocument.findUnique({
      where: { propertyId_type: { propertyId, type } },
    });
    if (!document && type === DocumentType.PLANIMETRIA) {
      document = await this.prisma.propertyDocument.findUnique({
        where: {
          propertyId_type: {
            propertyId,
            type: DocumentType.ELABORATO_PLANIMETRICO,
          },
        },
      });
    }
    if (!document) throw new NotFoundException("Documento non trovato");
    if (document.storageKey.startsWith("demo/")) {
      throw new NotFoundException("Documento demo non presente nello storage S3");
    }

    const stored = await this.storage.readPdfObject(document.storageKey);
    return {
      fileName: document.fileName,
      contentType: stored.contentType || document.mimeType || "application/pdf",
      contentLength: stored.contentLength ?? document.sizeBytes ?? undefined,
      stream: stored.stream,
    };
  }

  async deleteDocument(propertyId: string, rawType: string) {
    const type = parseDocumentType(rawType);
    await this.requireProperty(propertyId);
    const document = await this.prisma.propertyDocument.findUnique({
      where: { propertyId_type: { propertyId, type } },
    });
    if (!document) throw new NotFoundException("Documento non trovato");
    if (!document.storageKey.startsWith("demo/")) {
      await this.storage.deleteObject(document.storageKey);
    }
    await this.prisma.propertyDocument.delete({ where: { id: document.id } });
    return {
      deleted: true,
      propertyId,
      type: documentTypePath(type),
      fileName: document.fileName,
    };
  }

  private async requireProperty(propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException("Immobile non trovato");
    return property;
  }

  private async refreshStudyTotals(studyId: string) {
    const properties = await this.prisma.property.findMany({
      where: { studyId },
      include: { analysisDraft: true },
    });
    const originalRendita = sum(properties.map((property) => Number(property.currentRendita)));
    const totalRendita = sum(
      properties.map((property) => estimatedRenditaFromAnalysisDraft(property.analysisDraft) ?? Number(property.estimatedRendita)),
    );
    const catDRendita = sum(
      properties
        .filter((property) => property.categoria.trim().toUpperCase().startsWith("D/"))
        .map((property) => Number(property.currentRendita)),
    );
    const currentImu = sum(
      properties.map((property) => {
        return calculatedAmount(this.calculateImu(Number(property.currentRendita), property))
          ?? (property.currentImu === null ? 0 : Number(property.currentImu));
      }),
    );
    const estimatedImu = sum(
      properties.map((property) => {
        const estimatedRendita = estimatedRenditaFromAnalysisDraft(property.analysisDraft)
          ?? Number(property.estimatedRendita);
        return calculatedAmount(this.calculateImu(estimatedRendita, property))
          ?? (property.estimatedImu === null ? 0 : Number(property.estimatedImu));
      }),
    );
    await this.prisma.feasibilityStudy.update({
      where: { id: studyId },
      data: {
        originalRendita,
        totalRendita,
        catDRendita,
        diffRendita: totalRendita - originalRendita,
        diffImu: estimatedImu - currentImu,
      },
    });
  }

  private calculateImu(
    rendita: number,
    property: {
      categoria: string;
      comune: string;
      provincia: string | null;
      imuRateOverride?: Prisma.Decimal | number | null;
    },
  ) {
    return this.imu.calculate({
      rendita,
      categoria: property.categoria,
      comune: property.comune,
      provincia: property.provincia,
      rateOverridePercent: property.imuRateOverride === null || property.imuRateOverride === undefined
        ? null
        : Number(property.imuRateOverride),
    });
  }

  private validatePayload(propertyId: string, body: unknown): NormalizedDraftPayload {
    if (!body || typeof body !== "object") throw new BadRequestException("Bozza non valida");
    const payload = body as Partial<DraftPayload>;
    const savedAt = typeof payload.savedAt === "string" ? new Date(payload.savedAt) : null;
    const scaleSource = normalizeScaleSource(payload.scaleSource);
    const aiScaleDenominator = validateOptionalScaleDenominator(payload.aiScaleDenominator, "aiScaleDenominator");
    const aiSheetSize = validateOptionalSheetSize(payload.aiSheetSize, "aiSheetSize");
    const aiScaleConfidence = validateOptionalConfidence(payload.aiScaleConfidence, "aiScaleConfidence");
    const aiScaleDetectedAt = validateOptionalDate(payload.aiScaleDetectedAt, "aiScaleDetectedAt");
    const lotValuation = validateLotValuation(payload.lotValuation);
    if (
      payload.version !== 1 ||
      payload.propertyId !== propertyId ||
      (payload.document !== null && (payload.document === undefined || typeof payload.document !== "object")) ||
      (payload.sheetSize !== "A3" && payload.sheetSize !== "A4") ||
      typeof payload.scaleDenominator !== "number" ||
      payload.scaleDenominator < 20 ||
      payload.scaleDenominator > 20000 ||
      !Array.isArray(payload.selections) ||
      !savedAt ||
      Number.isNaN(savedAt.getTime())
    ) {
      throw new BadRequestException("Contenuto bozza non valido");
    }
    return {
      ...(payload as DraftPayload),
      scaleSource,
      aiScaleDenominator,
      aiScaleLabel: validateOptionalString(payload.aiScaleLabel, "aiScaleLabel"),
      aiSheetSize,
      aiScaleConfidence,
      aiScaleDetectedAt,
      lotValuation,
    };
  }
}

function validateDocumentUploadInput(body: unknown): DocumentUploadInput {
  if (!body || typeof body !== "object") throw new BadRequestException("Upload documento non valido");
  const input = body as Partial<DocumentUploadInput>;
  const fileName = typeof input.file_name === "string" ? input.file_name.trim() : "";
  const fileBase64 = typeof input.file_base64 === "string" ? input.file_base64.trim() : "";
  const mimeType = typeof input.mime_type === "string" && input.mime_type.trim() ? input.mime_type.trim() : "application/pdf";
  if (!fileName) throw new BadRequestException("file_name obbligatorio");
  if (!fileBase64) throw new BadRequestException("file_base64 obbligatorio");
  if (mimeType !== "application/pdf") throw new BadRequestException("Solo PDF supportati");
  if (!fileBase64.startsWith("data:application/pdf;base64,") && !fileBase64.startsWith("JVBER")) {
    throw new BadRequestException("file_base64 deve contenere un PDF base64");
  }
  return {
    file_name: fileName,
    file_base64: fileBase64,
    mime_type: mimeType,
  };
}

function normalizeScaleSource(value: unknown): ScaleSource {
  if (value === "AI" || value === "USER" || value === "CALIBRATION" || value === "DEFAULT") return value;
  return "DEFAULT";
}

function validatePropertyOutcome(value: unknown) {
  if (value === "Positivo" || value === "Negativo" || value === "Neutro") return value;
  throw new BadRequestException("Esito immobile non valido");
}

function validateImuRateOverride(value: unknown) {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
    throw new BadRequestException("Aliquota IMU manuale non valida: usa una percentuale tra 0 e 10");
  }
  return Math.round(parsed * 10_000) / 10_000;
}

function percentageDiff(current: number, estimated: number) {
  return current === 0 ? 0 : ((estimated - current) / current) * 100;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function calculatedAmount(calculation: ImuCalculation | null) {
  return calculation?.status === "calculated" ? calculation.amount : null;
}

function validateOptionalScaleDenominator(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 20 || value > 20000) {
    throw new BadRequestException(`${field} non valido`);
  }
  return value;
}

function validateOptionalSheetSize(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (value !== "A3" && value !== "A4") throw new BadRequestException(`${field} non valido`);
  return value;
}

function validateOptionalConfidence(value: unknown, field: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestException(`${field} non valido`);
  }
  return value;
}

function validateOptionalDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new BadRequestException(`${field} non valido`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} non valido`);
  return date.toISOString();
}

function validateOptionalString(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new BadRequestException(`${field} non valido`);
  return value;
}

function validateLotValuation(value: unknown): LotValuation {
  if (value === undefined || value === null) {
    return { mode: "percentage", percentage: 12, unitValuePerM2: 0 };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("lotValuation non valido");
  }
  const input = value as Partial<LotValuation>;
  if (input.mode !== "percentage" && input.mode !== "per_sqm") {
    throw new BadRequestException("lotValuation.mode non valido");
  }
  if (typeof input.percentage !== "number" || !Number.isFinite(input.percentage) || input.percentage < 0) {
    throw new BadRequestException("lotValuation.percentage non valido");
  }
  if (typeof input.unitValuePerM2 !== "number" || !Number.isFinite(input.unitValuePerM2) || input.unitValuePerM2 < 0) {
    throw new BadRequestException("lotValuation.unitValuePerM2 non valido");
  }
  return {
    mode: input.mode,
    percentage: input.percentage,
    unitValuePerM2: input.unitValuePerM2,
  };
}
