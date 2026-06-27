import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { DocumentType } from "../generated/prisma/enums.js";
import { DocumentStorageService } from "../erp-sync/document-storage.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type DraftPayload = {
  version: number;
  propertyId: string;
  document: unknown;
  savedAt: string;
  sheetSize: string;
  scaleDenominator: number;
  totalArea?: number;
  totalEstimatedAmount?: number;
  selections: unknown[];
};

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
  ) {}

  async getDraft(propertyId: string) {
    await this.requireProperty(propertyId);
    const draft = await this.prisma.planAnalysisDraft.findUnique({ where: { propertyId } });
    return draft?.payload ?? null;
  }

  async saveDraft(propertyId: string, body: unknown) {
    const payload = this.validatePayload(propertyId, body);
    const property = await this.requireProperty(propertyId);
    const latestVersion = await this.prisma.studyVersion.findFirst({
      where: { studyId: property.studyId },
      orderBy: { versionNumber: "desc" },
    });
    const savedAt = new Date(payload.savedAt);
    const data = {
      documentSource: payload.document as Prisma.InputJsonValue,
      payload: payload as unknown as Prisma.InputJsonValue,
      sheetSize: payload.sheetSize,
      scaleDenominator: payload.scaleDenominator,
      totalArea: payload.totalArea,
      totalEstimatedValue: payload.totalEstimatedAmount,
      savedAt,
      studyVersionId: latestVersion?.id,
    };

    const draft = await this.prisma.planAnalysisDraft.upsert({
      where: { propertyId },
      create: { propertyId, ...data },
      update: data,
    });
    return draft.payload;
  }

  async openDocument(propertyId: string, rawType: string) {
    const type = mapDocumentType(rawType);
    await this.requireProperty(propertyId);
    const document = await this.prisma.propertyDocument.findUnique({
      where: { propertyId_type: { propertyId, type } },
    });
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

  private async requireProperty(propertyId: string) {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException("Immobile non trovato");
    return property;
  }

  private validatePayload(propertyId: string, body: unknown): DraftPayload {
    if (!body || typeof body !== "object") throw new BadRequestException("Bozza non valida");
    const payload = body as Partial<DraftPayload>;
    const savedAt = typeof payload.savedAt === "string" ? new Date(payload.savedAt) : null;
    if (
      payload.version !== 1 ||
      payload.propertyId !== propertyId ||
      !payload.document ||
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
    return payload as DraftPayload;
  }
}

function mapDocumentType(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "planimetria") return DocumentType.PLANIMETRIA;
  if (normalized === "visura" || normalized === "visura_catastale") return DocumentType.VISURA;
  if (normalized === "elaborato" || normalized === "elaborato_planimetrico") {
    return DocumentType.ELABORATO_PLANIMETRICO;
  }
  throw new BadRequestException(`tipo documento non supportato: ${value}`);
}
