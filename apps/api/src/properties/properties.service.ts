import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
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
  constructor(private readonly prisma: PrismaService) {}

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
      payload.scaleDenominator < 50 ||
      payload.scaleDenominator > 5000 ||
      !Array.isArray(payload.selections) ||
      !savedAt ||
      Number.isNaN(savedAt.getTime())
    ) {
      throw new BadRequestException("Contenuto bozza non valido");
    }
    return payload as DraftPayload;
  }
}
