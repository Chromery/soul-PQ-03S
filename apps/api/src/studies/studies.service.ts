import { BadRequestException, Injectable } from "@nestjs/common";
import { DocumentType } from "../generated/prisma/enums.js";
import type {
  FeasibilityStudy,
  PriceList,
  Property,
  PropertyDocument,
  PropertyPriceList,
  StudyVersion,
} from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateStudyDto } from "./dto/update-study.dto.js";

type PropertyWithDocuments = Property & {
  documents: PropertyDocument[];
  priceLists: Array<PropertyPriceList & { priceList: PriceList }>;
};
type StudyWithRelations = FeasibilityStudy & {
  properties: PropertyWithDocuments[];
  versions: StudyVersion[];
};

@Injectable()
export class StudiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const studies = await this.prisma.feasibilityStudy.findMany({
      include: {
        properties: { include: propertyInclude(), orderBy: [{ displayOrder: "asc" }, { id: "asc" }] },
        versions: { orderBy: { versionNumber: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    return studies.map((study) => this.toApiStudy(study));
  }

  async find(id: string) {
    const study = await this.prisma.feasibilityStudy.findUnique({
      where: { id },
      include: {
        properties: { include: propertyInclude(), orderBy: [{ displayOrder: "asc" }, { id: "asc" }] },
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });
    return study ? this.toApiStudy(study) : null;
  }

  async update(id: string, input: UpdateStudyDto) {
    const exists = await this.prisma.feasibilityStudy.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return null;

    const study = await this.prisma.feasibilityStudy.update({
      where: { id },
      data: input,
      include: {
        properties: { include: propertyInclude(), orderBy: [{ displayOrder: "asc" }, { id: "asc" }] },
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });
    return this.toApiStudy(study);
  }

  async reorderProperties(id: string, propertyIds: string[]) {
    const study = await this.prisma.feasibilityStudy.findUnique({
      where: { id },
      select: { properties: { select: { id: true } } },
    });
    if (!study) return null;

    const availableIds = new Set(study.properties.map((property) => property.id));
    if (
      propertyIds.length !== availableIds.size ||
      propertyIds.some((propertyId) => !availableIds.has(propertyId))
    ) {
      throw new BadRequestException("L'ordine deve includere tutti gli immobili dello studio");
    }

    await this.prisma.$transaction(
      propertyIds.map((propertyId, displayOrder) =>
        this.prisma.property.update({ where: { id: propertyId }, data: { displayOrder } }),
      ),
    );
    return this.find(id);
  }

  private toApiStudy(study: StudyWithRelations) {
    return {
      ...study,
      diffRendita: Number(study.diffRendita),
      diffImu: Number(study.diffImu),
      originalRendita: Number(study.originalRendita),
      totalRendita: Number(study.totalRendita),
      catDRendita: Number(study.catDRendita),
      properties: study.properties.map((property) => this.toApiProperty(property)),
    };
  }

  private toApiProperty(property: PropertyWithDocuments) {
    const planimetria = property.documents.find((document) => document.type === DocumentType.PLANIMETRIA);
    const visura = property.documents.find((document) => document.type === DocumentType.VISURA);
    return {
      id: property.id,
      address: property.address,
      comune: property.comune,
      provincia: property.provincia,
      ubicazione: property.ubicazione,
      foglio: property.foglio,
      particella: property.particella,
      subalterno: property.subalterno,
      categoria: property.categoria,
      titolarita: property.titolarita,
      currentRendita: Number(property.currentRendita),
      estimatedRendita: Number(property.estimatedRendita),
      diffPercent: Number(property.diffPercent),
      currentImu: property.currentImu === null ? null : Number(property.currentImu),
      estimatedImu: property.estimatedImu === null ? null : Number(property.estimatedImu),
      imuDiff: Number(property.imuDiff),
      displayOrder: property.displayOrder,
      outcome: property.outcome,
      hasStudy: property.hasStudy,
      sheetSize: property.sheetSize,
      scaleDenominator: property.scaleDenominator,
      scaleSource: property.scaleSource,
      aiScaleDenominator: property.aiScaleDenominator,
      aiScaleLabel: property.aiScaleLabel,
      aiSheetSize: property.aiSheetSize,
      aiScaleConfidence: property.aiScaleConfidence === null ? null : Number(property.aiScaleConfidence),
      aiScaleDetectedAt: property.aiScaleDetectedAt?.toISOString() ?? null,
      documents: {
        planimetria: planimetria?.fileName ?? "",
        visura: visura?.fileName ?? "",
      },
      documentUrls: {
        planimetria: documentDownloadUrl(property.id, "planimetria", planimetria),
        visura: documentDownloadUrl(property.id, "visura", visura),
      },
      priceLists: property.priceLists
        .sort((a, b) => a.rank - b.rank)
        .map((match) => ({
          id: match.priceList.id,
          title: match.priceList.title,
          fileName: match.priceList.fileName,
          territoryName: match.priceList.territoryName,
          territoryScope: match.priceList.territoryScope,
          comune: match.priceList.comune,
          provincia: match.priceList.provincia,
          region: match.priceList.region,
          year: match.priceList.year,
          rank: match.rank,
          score: match.score,
          reason: match.reason,
          distanceKm: match.distanceKm,
          downloadUrl: `/api/price-lists/${encodeURIComponent(match.priceList.id)}/download`,
        })),
    };
  }
}

function propertyInclude() {
  return {
    documents: true,
    priceLists: {
      include: { priceList: true },
      orderBy: { rank: "asc" as const },
    },
  };
}

function documentDownloadUrl(propertyId: string, type: "planimetria" | "visura", document?: PropertyDocument) {
  if (!document || document.storageKey.startsWith("demo/")) return null;
  return `/api/properties/${encodeURIComponent(propertyId)}/documents/${type}/download`;
}
