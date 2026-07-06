import { BadRequestException, Injectable } from "@nestjs/common";
import { DocumentType } from "../generated/prisma/enums.js";
import type {
  FeasibilityStudy,
  PlanAnalysisDraft,
  PriceList,
  Property,
  PropertyDocument,
  PropertyPriceList,
  StudyVersion,
} from "../generated/prisma/client.js";
import { PriceListsService } from "../price-lists/price-lists.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateStudyDto } from "./dto/update-study.dto.js";

type PropertyWithDocuments = Property & {
  documents: PropertyDocument[];
  analysisDraft: PlanAnalysisDraft | null;
  priceLists: Array<PropertyPriceList & { priceList: PriceList }>;
};
type StudyWithRelations = FeasibilityStudy & {
  properties: PropertyWithDocuments[];
  versions: StudyVersion[];
};

type CreateStudyInput = {
  company: string;
  vat: string;
  comune: string;
  provincia: string;
  region: string;
  commercialOwner: string;
  technicalOwner: string;
  notes: string;
  deadline?: string;
  property: {
    address: string;
    comune: string;
    provincia: string;
    ubicazione: string;
    foglio: string | null;
    particella: string | null;
    subalterno: string | null;
    categoria: string;
    titolarita: string | null;
  };
};

@Injectable()
export class StudiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceLists: PriceListsService,
  ) {}

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

  async create(body: unknown) {
    const input = validateCreateStudyInput(body);
    const now = new Date();
    const stamp = now.getTime();
    const studyId = `PQ-${stamp}`;
    const propertyId = `IMM-PQ-${stamp}-001`;
    const deadline = input.deadline ? parseDate(input.deadline, "deadline") : addDays(now, 30);

    await this.prisma.$transaction(async (tx) => {
      await tx.feasibilityStudy.create({
        data: {
          id: studyId,
          companyErpId: null,
          company: input.company,
          vat: input.vat,
          comune: input.comune,
          provincia: input.provincia,
          region: input.region,
          status: "Da iniziare",
          createdAt: now,
          concludedAt: null,
          deadline,
          nextAppointment: null,
          diffRendita: 0,
          diffImu: 0,
          originalRendita: 0,
          totalRendita: 0,
          catDRendita: 0,
          commercialOwner: input.commercialOwner,
          technicalOwner: input.technicalOwner,
          notes: input.notes,
          erpUrl: null,
          erpImportedAt: null,
          erpUpdatedAt: null,
          sourceSyncId: "pq-manual",
        },
      });
      await tx.studyVersion.create({
        data: {
          studyId,
          versionNumber: 1,
          status: "Da iniziare",
          technicalOwner: input.technicalOwner,
          notes: "Studio creato direttamente da PQ.",
        },
      });
      await tx.property.create({
        data: {
          id: propertyId,
          studyId,
          address: input.property.address,
          comune: input.property.comune,
          provincia: input.property.provincia,
          ubicazione: input.property.ubicazione,
          foglio: input.property.foglio,
          particella: input.property.particella,
          subalterno: input.property.subalterno,
          categoria: input.property.categoria,
          titolarita: input.property.titolarita,
          currentRendita: 0,
          estimatedRendita: 0,
          diffPercent: 0,
          currentImu: null,
          estimatedImu: null,
          imuDiff: 0,
          displayOrder: 0,
          outcome: "Neutro",
          hasStudy: false,
        },
      });
    });

    try {
      await this.priceLists.assignForProperty(propertyId);
    } catch (error) {
      console.error("Price list assignment failed for manually-created study", error);
    }

    return this.find(studyId);
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
    const currentRendita = Number(property.currentRendita);
    const estimatedRendita =
      property.analysisDraft?.totalEstimatedValue === null || property.analysisDraft?.totalEstimatedValue === undefined
        ? Number(property.estimatedRendita)
        : Number(property.analysisDraft.totalEstimatedValue);
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
      currentRendita,
      estimatedRendita,
      diffPercent: currentRendita === 0 ? 0 : ((estimatedRendita - currentRendita) / currentRendita) * 100,
      currentImu: property.currentImu === null ? null : Number(property.currentImu),
      estimatedImu: property.estimatedImu === null ? null : Number(property.estimatedImu),
      imuDiff: Number(property.imuDiff),
      displayOrder: property.displayOrder,
      outcome: normalizePropertyOutcome(property.outcome),
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
    analysisDraft: true,
    priceLists: {
      include: { priceList: true },
      orderBy: { rank: "asc" as const },
    },
  };
}

function normalizePropertyOutcome(value: string | null | undefined) {
  if (value === "Positivo" || value?.toLowerCase() === "positivo") return "Positivo";
  if (value === "Negativo" || value?.toLowerCase() === "negativo") return "Negativo";
  return "Neutro";
}

function documentDownloadUrl(propertyId: string, type: "planimetria" | "visura", document?: PropertyDocument) {
  if (!document || document.storageKey.startsWith("demo/")) return null;
  return `/api/properties/${encodeURIComponent(propertyId)}/documents/${type}/download`;
}

function validateCreateStudyInput(body: unknown): CreateStudyInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("Creazione studio non valida");
  }
  const input = body as Record<string, unknown>;
  const property = input.property;
  if (!property || typeof property !== "object" || Array.isArray(property)) {
    throw new BadRequestException("Immobile iniziale obbligatorio");
  }
  const propertyInput = property as Record<string, unknown>;
  const company = requiredString(input.company, "company", 160);
  const studyComune = requiredString(input.comune, "comune", 100);
  const studyProvincia = requiredString(input.provincia, "provincia", 10).toUpperCase();
  const region = requiredString(input.region, "region", 80);
  const address = requiredString(propertyInput.address, "property.address", 200);
  const propertyComune = optionalString(propertyInput.comune, 100) ?? studyComune;
  const propertyProvincia = (optionalString(propertyInput.provincia, 10) ?? studyProvincia).toUpperCase();

  return {
    company,
    vat: optionalString(input.vat, 40) ?? "",
    comune: studyComune,
    provincia: studyProvincia,
    region,
    commercialOwner: optionalString(input.commercialOwner, 120) ?? "Default User",
    technicalOwner: optionalString(input.technicalOwner, 120) ?? "Default User",
    notes: optionalString(input.notes, 4000) ?? "Studio creato direttamente da PQ.",
    deadline: optionalString(input.deadline, 40) ?? undefined,
    property: {
      address,
      comune: propertyComune,
      provincia: propertyProvincia,
      ubicazione: optionalString(propertyInput.ubicazione, 220) ?? address,
      foglio: optionalString(propertyInput.foglio, 40),
      particella: optionalString(propertyInput.particella, 60),
      subalterno: optionalString(propertyInput.subalterno, 40),
      categoria: optionalString(propertyInput.categoria, 30) ?? "D/7",
      titolarita: optionalString(propertyInput.titolarita, 160),
    },
  };
}

function requiredString(value: unknown, field: string, maxLength: number) {
  const normalized = optionalString(value, maxLength);
  if (!normalized) throw new BadRequestException(`${field} obbligatorio`);
  return normalized;
}

function optionalString(value: unknown, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function parseDate(value: string, field: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} non valido`);
  return date;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
