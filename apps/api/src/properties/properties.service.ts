import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import type { Readable } from "node:stream";
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
  pageScales?: Record<string, PageScalePayload>;
  totalArea?: number;
  totalEstimatedAmount?: number;
  totalEstimatedRendita?: number;
  totalBaseAmount?: number;
  totalOneriAmount?: number;
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

type PageScalePayload = {
  sheetSize: "A3" | "A4";
  scaleDenominator: number;
  scaleSource: ScaleSource;
  aiScaleDenominator: number | null;
  aiScaleLabel: string | null;
  aiSheetSize: "A3" | "A4" | null;
  aiScaleConfidence: number | null;
  aiScaleDetectedAt: string | null;
  calibration: unknown | null;
};

type LotValuation = {
  mode: "percentage" | "per_sqm";
  percentage: number;
  unitValuePerM2: number;
  manualAreaM2: number;
};

type DocumentUploadInput = {
  file_name: string;
  file_base64: string;
  mime_type?: string;
};

type PreviousValuationGroupPropertyValue = {
  id: string;
  estimatedRendita: number;
  diffPercent: number;
  estimatedImu: number | null;
  imuDiff: number;
  hasStudy: boolean;
};

const PREVIOUS_GROUP_VALUES_KEY = "previousPropertyValues";

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

  async getValuationGroupDraft(valuationGroupId: string) {
    await this.requireValuationGroup(valuationGroupId);
    const draft = await this.prisma.propertyValuationGroupAnalysisDraft.findUnique({
      where: { valuationGroupId },
    });
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

  async getStudyGroupDraft(studyGroupId: string) {
    await this.requireStudyGroup(studyGroupId);
    const draft = await this.prisma.studyGroupAnalysisDraft.findUnique({
      where: { studyGroupId },
    });
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
    const totalEstimatedRendita = estimatedRenditaFromDraftPayload(payload, property.oneri);
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
          ...(typeof payload.totalOneriAmount === "number" ? { oneri: false } : {}),
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

  async saveValuationGroupDraft(valuationGroupId: string, body: unknown) {
    const payload = this.validatePayload(valuationGroupId, body);
    const group = await this.requireValuationGroup(valuationGroupId);
    const existingDraft = await this.prisma.propertyValuationGroupAnalysisDraft.findUnique({
      where: { valuationGroupId },
      select: { payload: true },
    });
    const previousPropertyValues = previousValuationGroupPropertyValues(existingDraft?.payload)
      ?? group.properties.map((property) => ({
        id: property.id,
        estimatedRendita: Number(property.estimatedRendita),
        diffPercent: Number(property.diffPercent),
        estimatedImu: property.estimatedImu === null ? null : Number(property.estimatedImu),
        imuDiff: Number(property.imuDiff),
        hasStudy: property.hasStudy,
      }));
    const savedAt = new Date(payload.savedAt);
    const aiScaleDetectedAt = payload.aiScaleDetectedAt ? new Date(payload.aiScaleDetectedAt) : null;
    const totalEstimatedRendita = estimatedRenditaFromDraftPayload(payload, false);
    if (totalEstimatedRendita === null) {
      throw new BadRequestException("La bozza complessiva non contiene una rendita stimata valida");
    }
    const allocations = allocateGroupRendita(
      totalEstimatedRendita,
      group.properties.map((property) => ({
        id: property.id,
        currentRendita: Number(property.currentRendita),
      })),
    );
    const data = {
      documentSource: (payload.document === null ? Prisma.JsonNull : payload.document) as Prisma.InputJsonValue,
      payload: {
        ...payload,
        [PREVIOUS_GROUP_VALUES_KEY]: previousPropertyValues,
      } as unknown as Prisma.InputJsonValue,
      sheetSize: payload.sheetSize,
      scaleDenominator: payload.scaleDenominator,
      scaleSource: payload.scaleSource,
      aiScaleDenominator: payload.aiScaleDenominator,
      aiScaleLabel: payload.aiScaleLabel,
      aiSheetSize: payload.aiSheetSize,
      aiScaleConfidence: payload.aiScaleConfidence,
      aiScaleDetectedAt,
      totalArea: payload.totalArea,
      totalEstimatedValue: totalEstimatedRendita,
      savedAt,
    };
    const propertyUpdates = group.properties.map((property) => {
      const estimatedRendita = allocations.get(property.id) ?? 0;
      const currentImuCalculation = this.calculateImu(Number(property.currentRendita), property);
      const estimatedImuCalculation = this.calculateImu(estimatedRendita, property);
      const currentImu = calculatedAmount(currentImuCalculation)
        ?? (property.currentImu === null ? null : Number(property.currentImu));
      const estimatedImu = calculatedAmount(estimatedImuCalculation);
      return {
        property,
        estimatedRendita,
        currentImu,
        estimatedImu,
        imuCalculation: estimatedImuCalculation,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.propertyValuationGroupAnalysisDraft.upsert({
        where: { valuationGroupId },
        create: { valuationGroupId, ...data },
        update: data,
      });
      for (const update of propertyUpdates) {
        await tx.property.update({
          where: { id: update.property.id },
          data: {
            estimatedRendita: update.estimatedRendita,
            diffPercent: percentageDiff(Number(update.property.currentRendita), update.estimatedRendita),
            estimatedImu: update.estimatedImu,
            imuDiff: update.estimatedImu === null || update.currentImu === null
              ? 0
              : update.estimatedImu - update.currentImu,
            hasStudy: true,
          },
        });
      }
      await tx.propertyValuationGroup.update({
        where: { id: valuationGroupId },
        data: { updatedAt: new Date() },
      });
    });
    await this.refreshStudyTotals(group.studyId);
    const estimatedImu = nullableSum(propertyUpdates.map((update) => update.estimatedImu));
    return {
      ...payload,
      estimatedImu,
      valuationGroupId,
      properties: propertyUpdates.map((update) => ({
        id: update.property.id,
        estimatedRendita: update.estimatedRendita,
        estimatedImu: update.estimatedImu,
        imuCalculation: update.imuCalculation,
      })),
    };
  }

  async saveStudyGroupDraft(studyGroupId: string, body: unknown) {
    const payload = this.validatePayload(studyGroupId, body);
    const group = await this.requireStudyGroup(studyGroupId);
    const properties = group.studies.flatMap((study) => study.properties);
    if (properties.length === 0) {
      throw new BadRequestException("Il gruppo di studi non contiene immobili da valutare");
    }
    const existingDraft = await this.prisma.studyGroupAnalysisDraft.findUnique({
      where: { studyGroupId },
      select: { payload: true },
    });
    const previousPropertyValues = previousValuationGroupPropertyValues(existingDraft?.payload)
      ?? properties.map((property) => ({
        id: property.id,
        estimatedRendita: Number(property.estimatedRendita),
        diffPercent: Number(property.diffPercent),
        estimatedImu: property.estimatedImu === null ? null : Number(property.estimatedImu),
        imuDiff: Number(property.imuDiff),
        hasStudy: property.hasStudy,
      }));
    const savedAt = new Date(payload.savedAt);
    const aiScaleDetectedAt = payload.aiScaleDetectedAt ? new Date(payload.aiScaleDetectedAt) : null;
    const totalEstimatedRendita = estimatedRenditaFromDraftPayload(payload, false);
    if (totalEstimatedRendita === null) {
      throw new BadRequestException("La bozza complessiva non contiene una rendita stimata valida");
    }
    const allocations = allocateGroupRendita(
      totalEstimatedRendita,
      properties.map((property) => ({
        id: property.id,
        currentRendita: Number(property.currentRendita),
      })),
    );
    const data = {
      documentSource: (payload.document === null ? Prisma.JsonNull : payload.document) as Prisma.InputJsonValue,
      payload: {
        ...payload,
        [PREVIOUS_GROUP_VALUES_KEY]: previousPropertyValues,
      } as unknown as Prisma.InputJsonValue,
      sheetSize: payload.sheetSize,
      scaleDenominator: payload.scaleDenominator,
      scaleSource: payload.scaleSource,
      aiScaleDenominator: payload.aiScaleDenominator,
      aiScaleLabel: payload.aiScaleLabel,
      aiSheetSize: payload.aiSheetSize,
      aiScaleConfidence: payload.aiScaleConfidence,
      aiScaleDetectedAt,
      totalArea: payload.totalArea,
      totalEstimatedValue: totalEstimatedRendita,
      savedAt,
    };
    const propertyUpdates = properties.map((property) => {
      const estimatedRendita = allocations.get(property.id) ?? 0;
      const currentImuCalculation = this.calculateImu(Number(property.currentRendita), property);
      const estimatedImuCalculation = this.calculateImu(estimatedRendita, property);
      const currentImu = calculatedAmount(currentImuCalculation)
        ?? (property.currentImu === null ? null : Number(property.currentImu));
      const estimatedImu = calculatedAmount(estimatedImuCalculation);
      return {
        property,
        estimatedRendita,
        currentImu,
        estimatedImu,
        imuCalculation: estimatedImuCalculation,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.studyGroupAnalysisDraft.upsert({
        where: { studyGroupId },
        create: { studyGroupId, ...data },
        update: data,
      });
      for (const update of propertyUpdates) {
        await tx.property.update({
          where: { id: update.property.id },
          data: {
            estimatedRendita: update.estimatedRendita,
            diffPercent: percentageDiff(Number(update.property.currentRendita), update.estimatedRendita),
            estimatedImu: update.estimatedImu,
            imuDiff: update.estimatedImu === null || update.currentImu === null
              ? 0
              : update.estimatedImu - update.currentImu,
            hasStudy: true,
          },
        });
      }
      await tx.studyGroup.update({
        where: { id: studyGroupId },
        data: { updatedAt: new Date() },
      });
    });
    for (const study of group.studies) await this.refreshStudyTotals(study.id);
    const estimatedImu = nullableSum(propertyUpdates.map((update) => update.estimatedImu));
    return {
      ...payload,
      estimatedImu,
      studyGroupId,
      properties: propertyUpdates.map((update) => ({
        id: update.property.id,
        estimatedRendita: update.estimatedRendita,
        estimatedImu: update.estimatedImu,
        imuCalculation: update.imuCalculation,
      })),
    };
  }

  async openValuationGroupPlan(valuationGroupId: string) {
    const group = await this.requireValuationGroup(valuationGroupId);
    const merged = await PDFDocument.create();
    const includedPropertyIds: string[] = [];
    const missingPropertyIds: string[] = [];

    for (const property of group.properties) {
      const document = property.documents.find((item) => item.type === DocumentType.PLANIMETRIA)
        ?? property.documents.find((item) => item.type === DocumentType.ELABORATO_PLANIMETRICO);
      if (!document || document.storageKey.startsWith("demo/")) {
        missingPropertyIds.push(property.id);
        continue;
      }
      const stored = await this.storage.readPdfObject(document.storageKey);
      const source = await PDFDocument.load(await streamToBuffer(stored.stream), { ignoreEncryption: true });
      const pages = await merged.copyPages(source, source.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
      includedPropertyIds.push(property.id);
    }

    if (merged.getPageCount() === 0) {
      throw new NotFoundException("Nessun elaborato planimetrico disponibile per la valutazione complessiva");
    }
    return {
      buffer: Buffer.from(await merged.save()),
      fileName: `valutazione-complessiva-${valuationGroupId}.pdf`,
      includedPropertyIds,
      missingPropertyIds,
    };
  }

  async openStudyGroupPlan(studyGroupId: string) {
    const group = await this.requireStudyGroup(studyGroupId);
    const merged = await PDFDocument.create();
    const includedPropertyIds: string[] = [];
    const missingPropertyIds: string[] = [];

    for (const study of group.studies) {
      for (const property of study.properties) {
        const document = property.documents.find((item) => item.type === DocumentType.PLANIMETRIA)
          ?? property.documents.find((item) => item.type === DocumentType.ELABORATO_PLANIMETRICO);
        if (!document || document.storageKey.startsWith("demo/")) {
          missingPropertyIds.push(property.id);
          continue;
        }
        const stored = await this.storage.readPdfObject(document.storageKey);
        const source = await PDFDocument.load(await streamToBuffer(stored.stream), { ignoreEncryption: true });
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
        includedPropertyIds.push(property.id);
      }
    }

    if (merged.getPageCount() === 0) {
      throw new NotFoundException("Nessun elaborato planimetrico disponibile per il gruppo di studi");
    }
    return {
      buffer: Buffer.from(await merged.save()),
      fileName: `valutazione-gruppo-studi-${studyGroupId}.pdf`,
      includedPropertyIds,
      missingPropertyIds,
    };
  }

  async updateProperty(propertyId: string, body: unknown) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestException("Modifica immobile non valida");
    }
    const input = body as Record<string, unknown>;
    const hasOutcome = Object.prototype.hasOwnProperty.call(input, "outcome");
    const hasImuRateOverride = Object.prototype.hasOwnProperty.call(input, "imuRateOverride");
    const hasImuMultiplierOverride = Object.prototype.hasOwnProperty.call(input, "imuMultiplierOverride");
    const hasOneri = Object.prototype.hasOwnProperty.call(input, "oneri");
    const hasNotes = Object.prototype.hasOwnProperty.call(input, "notes");
    const hasImuOverride = hasImuRateOverride || hasImuMultiplierOverride;
    if (!hasOutcome && !hasImuOverride && !hasOneri && !hasNotes) {
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
    const imuMultiplierOverride = hasImuMultiplierOverride
      ? validateImuMultiplierOverride(input.imuMultiplierOverride)
      : existing.imuMultiplierOverride === null
        ? null
        : Number(existing.imuMultiplierOverride);
    const oneri = hasOneri ? validateOneri(input.oneri) : existing.oneri;
    const notes = hasNotes ? validatePropertyNotes(input.notes) : existing.notes;
    const property = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(hasOutcome ? { outcome } : {}),
        ...(hasImuRateOverride ? { imuRateOverride } : {}),
        ...(hasImuMultiplierOverride ? { imuMultiplierOverride } : {}),
        ...(hasOneri ? { oneri } : {}),
        ...(hasNotes ? { notes } : {}),
      },
    });
    if (!hasImuOverride && !hasOneri) {
      return { id: property.id, outcome: property.outcome, oneri: property.oneri, notes: property.notes };
    }

    const calculationProperty = { ...property, imuRateOverride, imuMultiplierOverride };
    const estimatedRendita = estimatedRenditaFromAnalysisDraft(existing.analysisDraft, oneri)
      ?? Number(property.estimatedRendita);
    const currentImuCalculation = this.calculateImu(Number(property.currentRendita), calculationProperty);
    const estimatedImuCalculation = estimatedRendita > 0 || property.hasStudy
      ? this.calculateImu(estimatedRendita, calculationProperty)
      : null;
    const currentImu = calculatedAmount(currentImuCalculation)
      ?? (property.currentImu === null ? null : Number(property.currentImu));
    const estimatedImu = calculatedAmount(estimatedImuCalculation)
      ?? (property.estimatedImu === null ? null : Number(property.estimatedImu));
    const imuDiff = currentImu === null || estimatedImu === null ? 0 : estimatedImu - currentImu;
    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        estimatedRendita,
        diffPercent: percentageDiff(Number(property.currentRendita), estimatedRendita),
        estimatedImu,
        imuDiff,
      },
    });
    await this.refreshStudyTotals(property.studyId);
    return {
      id: property.id,
      outcome: property.outcome,
      oneri,
      notes: property.notes,
      estimatedRendita,
      diffPercent: percentageDiff(Number(property.currentRendita), estimatedRendita),
      imuRateOverride,
      imuMultiplierOverride,
      currentImu,
      estimatedImu,
      imuDiff,
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

  private async requireValuationGroup(valuationGroupId: string) {
    const group = await this.prisma.propertyValuationGroup.findUnique({
      where: { id: valuationGroupId },
      include: {
        properties: {
          include: { documents: true },
          orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!group || group.properties.length < 2) {
      throw new NotFoundException("Gruppo di valutazione non trovato");
    }
    return group;
  }

  private async requireStudyGroup(studyGroupId: string) {
    const group = await this.prisma.studyGroup.findUnique({
      where: { id: studyGroupId },
      include: {
        studies: {
          include: {
            properties: {
              include: { documents: true },
              orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
            },
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!group || group.studies.length < 2) {
      throw new NotFoundException("Gruppo di studi non trovato");
    }
    return group;
  }

  private async refreshStudyTotals(studyId: string) {
    const properties = await this.prisma.property.findMany({
      where: { studyId },
      include: {
        analysisDraft: true,
        valuationGroup: { include: { analysisDraft: true } },
        study: { select: { studyGroup: { select: { analysisDraft: { select: { id: true } } } } } },
      },
    });
    const usesStudyGroupDraft = properties.some((property) => Boolean(property.study?.studyGroup?.analysisDraft));
    const originalRendita = sum(properties.map((property) => Number(property.currentRendita)));
    const totalRendita = sum(
      properties.map((property) =>
        usesStudyGroupDraft || property.valuationGroup?.analysisDraft
          ? Number(property.estimatedRendita)
          : estimatedRenditaFromAnalysisDraft(property.analysisDraft, property.oneri)
            ?? Number(property.estimatedRendita)),
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
        const estimatedRendita = usesStudyGroupDraft || property.valuationGroup?.analysisDraft
          ? Number(property.estimatedRendita)
          : estimatedRenditaFromAnalysisDraft(property.analysisDraft, property.oneri)
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
      imuMultiplierOverride?: Prisma.Decimal | number | null;
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
      cadastralMultiplierOverride:
        property.imuMultiplierOverride === null || property.imuMultiplierOverride === undefined
          ? null
          : Number(property.imuMultiplierOverride),
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
    const pageScales = validatePageScales(payload.pageScales);
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
      pageScales,
      lotValuation,
    };
  }
}

function previousValuationGroupPropertyValues(value: unknown): PreviousValuationGroupPropertyValue[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = (value as Record<string, unknown>)[PREVIOUS_GROUP_VALUES_KEY];
  if (!Array.isArray(entries)) return null;
  const normalized = entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    if (
      typeof record.id !== "string"
      || typeof record.estimatedRendita !== "number"
      || typeof record.diffPercent !== "number"
      || (record.estimatedImu !== null && typeof record.estimatedImu !== "number")
      || typeof record.imuDiff !== "number"
      || typeof record.hasStudy !== "boolean"
    ) return [];
    return [record as PreviousValuationGroupPropertyValue];
  });
  return normalized.length === entries.length ? normalized : null;
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

function validateOneri(value: unknown) {
  if (typeof value === "boolean") return value;
  throw new BadRequestException("Flag Oneri non valido");
}

function validatePropertyNotes(value: unknown) {
  if (typeof value !== "string") throw new BadRequestException("Note immobile non valide");
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length > 4000) {
    throw new BadRequestException("Le note immobile non possono superare 4000 caratteri");
  }
  return normalized;
}

function validateImuRateOverride(value: unknown) {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) {
    throw new BadRequestException("Aliquota IMU manuale non valida: usa una percentuale tra 0 e 10");
  }
  return Math.round(parsed * 10_000) / 10_000;
}

function validateImuMultiplierOverride(value: unknown) {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000) {
    throw new BadRequestException("Moltiplicatore catastale manuale non valido: usa un valore maggiore di 0 e non superiore a 10000");
  }
  return Math.round(parsed * 10_000) / 10_000;
}

function percentageDiff(current: number, estimated: number) {
  return current === 0 ? 0 : ((estimated - current) / current) * 100;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function nullableSum(values: Array<number | null>) {
  return values.some((value) => value === null)
    ? null
    : sum(values as number[]);
}

export function allocateGroupRendita(
  total: number,
  properties: Array<{ id: string; currentRendita: number }>,
) {
  const totalCents = Math.max(0, Math.round(total * 100));
  if (properties.length === 0) return new Map<string, number>();
  const positiveTotal = sum(properties.map((property) => Math.max(0, property.currentRendita)));
  const rawShares = properties.map((property) => {
    const weight = positiveTotal > 0
      ? Math.max(0, property.currentRendita) / positiveTotal
      : 1 / properties.length;
    const rawCents = totalCents * weight;
    return {
      id: property.id,
      cents: Math.floor(rawCents),
      remainder: rawCents - Math.floor(rawCents),
    };
  });
  let remaining = totalCents - sum(rawShares.map((share) => share.cents));
  [...rawShares]
    .sort((first, second) => second.remainder - first.remainder || first.id.localeCompare(second.id))
    .forEach((share) => {
      if (remaining <= 0) return;
      share.cents += 1;
      remaining -= 1;
    });
  return new Map(rawShares.map((share) => [share.id, share.cents / 100]));
}

async function streamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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

function validatePageScales(value: unknown): Record<string, PageScalePayload> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("pageScales non valido");
  }
  const normalized: Record<string, PageScalePayload> = {};
  for (const [page, rawScale] of Object.entries(value as Record<string, unknown>)) {
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || !rawScale
      || typeof rawScale !== "object" || Array.isArray(rawScale)) {
      throw new BadRequestException(`pageScales.${page} non valido`);
    }
    const scale = rawScale as Record<string, unknown>;
    const sheetSize = validateOptionalSheetSize(scale.sheetSize, `pageScales.${page}.sheetSize`);
    const scaleDenominator = validateOptionalScaleDenominator(
      scale.scaleDenominator,
      `pageScales.${page}.scaleDenominator`,
    );
    if (!sheetSize || scaleDenominator === null) {
      throw new BadRequestException(`pageScales.${page} non valido`);
    }
    normalized[String(pageNumber)] = {
      sheetSize,
      scaleDenominator,
      scaleSource: normalizeScaleSource(scale.scaleSource),
      aiScaleDenominator: validateOptionalScaleDenominator(
        scale.aiScaleDenominator,
        `pageScales.${page}.aiScaleDenominator`,
      ),
      aiScaleLabel: validateOptionalString(scale.aiScaleLabel, `pageScales.${page}.aiScaleLabel`),
      aiSheetSize: validateOptionalSheetSize(scale.aiSheetSize, `pageScales.${page}.aiSheetSize`),
      aiScaleConfidence: validateOptionalConfidence(
        scale.aiScaleConfidence,
        `pageScales.${page}.aiScaleConfidence`,
      ),
      aiScaleDetectedAt: validateOptionalDate(
        scale.aiScaleDetectedAt,
        `pageScales.${page}.aiScaleDetectedAt`,
      ),
      calibration: scale.calibration ?? null,
    };
  }
  return normalized;
}

function validateLotValuation(value: unknown): LotValuation {
  if (value === undefined || value === null) {
    return { mode: "percentage", percentage: 12, unitValuePerM2: 0, manualAreaM2: 0 };
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
  const manualAreaM2 = input.manualAreaM2 ?? 0;
  if (typeof manualAreaM2 !== "number" || !Number.isFinite(manualAreaM2) || manualAreaM2 < 0) {
    throw new BadRequestException("lotValuation.manualAreaM2 non valido");
  }
  return {
    mode: input.mode,
    percentage: input.percentage,
    unitValuePerM2: input.unitValuePerM2,
    manualAreaM2,
  };
}
