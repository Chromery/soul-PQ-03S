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
import {
  formapsTerritoryByMunicipalityId,
  resolveFormapsTerritory,
} from "../formaps-territories/formaps-territory-resolver.js";
import { ImuService } from "../imu/imu.service.js";
import type { ImuCalculation } from "../imu/imu.types.js";
import { PriceListsService } from "../price-lists/price-lists.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { estimatedRenditaFromAnalysisDraft } from "../rendita.js";
import { municipalityWithSection } from "../visura-extraction/visura-text-extractor.js";
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
};

type CreatePropertyInput = {
  address: string;
  comune?: string;
  provincia?: string;
  ubicazione: string;
  foglio: string | null;
  particella: string | null;
  subalterno: string | null;
  categoria: string;
  titolarita: string | null;
  currentRendita: number;
  estimatedRendita: number;
  currentImu: number | null;
  estimatedImu: number | null;
};

type DeletePropertiesInput = {
  propertyIds: string[];
};

@Injectable()
export class StudiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly priceLists: PriceListsService,
    private readonly imu: ImuService,
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
    });

    return this.find(studyId);
  }

  async createProperty(studyId: string, body: unknown) {
    const study = await this.prisma.feasibilityStudy.findUnique({
      where: { id: studyId },
      select: { id: true, provincia: true, region: true, properties: { select: { id: true, displayOrder: true } } },
    });
    if (!study) return null;
    const input = validateCreatePropertyInput(body);
    const nextIndex = study.properties.length + 1;
    const propertyId = `IMM-PQ-${Date.now()}-${String(nextIndex).padStart(3, "0")}`;
    const displayOrder =
      study.properties.length === 0
        ? 0
        : Math.max(...study.properties.map((property) => property.displayOrder)) + 1;
    const currentImuCalculation = this.calculateImu(input.currentRendita, input, study.provincia);
    const estimatedImuCalculation = input.estimatedRendita > 0
      ? this.calculateImu(input.estimatedRendita, input, study.provincia)
      : null;
    const currentImu = calculatedAmount(currentImuCalculation) ?? input.currentImu;
    const estimatedImu = calculatedAmount(estimatedImuCalculation) ?? input.estimatedImu;
    await this.prisma.property.create({
      data: {
        id: propertyId,
        studyId,
        address: input.address,
        comune: input.comune ?? "",
        provincia: input.provincia ?? study.provincia,
        ubicazione: input.ubicazione,
        foglio: input.foglio,
        particella: input.particella,
        subalterno: input.subalterno,
        categoria: input.categoria,
        titolarita: input.titolarita,
        currentRendita: input.currentRendita,
        estimatedRendita: input.estimatedRendita,
        diffPercent: percentageDiff(input.currentRendita, input.estimatedRendita),
        currentImu,
        estimatedImu,
        imuDiff: (estimatedImu ?? 0) - (currentImu ?? 0),
        displayOrder,
        outcome: "Neutro",
        hasStudy: false,
      },
    });

    try {
      await this.priceLists.assignForProperty(propertyId);
    } catch (error) {
      console.error("Price list assignment failed for manually-created property", error);
    }

    await this.refreshStudyTotals(studyId);
    return this.find(studyId);
  }

  async deleteProperties(studyId: string, body: unknown) {
    const study = await this.prisma.feasibilityStudy.findUnique({
      where: { id: studyId },
      select: { id: true, properties: { select: { id: true } } },
    });
    if (!study) return null;
    const input = validateDeletePropertiesInput(body);
    const availableIds = new Set(study.properties.map((property) => property.id));
    if (input.propertyIds.some((propertyId) => !availableIds.has(propertyId))) {
      throw new BadRequestException("Uno o piu immobili non appartengono allo studio");
    }

    await this.prisma.property.deleteMany({
      where: { studyId, id: { in: input.propertyIds } },
    });
    await this.compactPropertyOrder(studyId);
    await this.refreshStudyTotals(studyId);
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

  private async compactPropertyOrder(studyId: string) {
    const properties = await this.prisma.property.findMany({
      where: { studyId },
      select: { id: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });
    if (properties.length === 0) return;
    await this.prisma.$transaction(
      properties.map((property, displayOrder) =>
        this.prisma.property.update({ where: { id: property.id }, data: { displayOrder } }),
      ),
    );
  }

  private async refreshStudyTotals(studyId: string) {
    const properties = await this.prisma.property.findMany({
      where: { studyId },
      include: { analysisDraft: true },
    });
    const originalRendita = sum(properties.map((property) => Number(property.currentRendita)));
    const totalRendita = sum(
      properties.map((property) =>
        estimatedRenditaFromAnalysisDraft(property.analysisDraft) ?? Number(property.estimatedRendita),
      ),
    );
    const catDRendita = sum(
      properties
        .filter((property) => property.categoria.trim().toUpperCase().startsWith("D/"))
        .map((property) => Number(property.currentRendita)),
    );
    const currentImu = sum(
      properties.map((property) => (
        calculatedAmount(this.calculateImu(Number(property.currentRendita), property))
        ?? (property.currentImu === null ? 0 : Number(property.currentImu))
      )),
    );
    const estimatedImu = sum(
      properties.map((property) => {
        const estimatedRendita = estimatedRenditaFromAnalysisDraft(property.analysisDraft)
          ?? Number(property.estimatedRendita);
        const calculation = estimatedRendita > 0 ? this.calculateImu(estimatedRendita, property) : null;
        return calculatedAmount(calculation) ?? (property.estimatedImu === null ? 0 : Number(property.estimatedImu));
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

  private toApiStudy(study: StudyWithRelations) {
    const properties = study.properties.map((property) => this.toApiProperty(property));
    const currentImu = sum(properties.map((property) => property.currentImu ?? 0));
    const estimatedImu = sum(properties.map((property) => property.estimatedImu ?? 0));
    return {
      ...study,
      diffRendita: Number(study.diffRendita),
      diffImu: estimatedImu - currentImu,
      originalRendita: Number(study.originalRendita),
      totalRendita: Number(study.totalRendita),
      catDRendita: Number(study.catDRendita),
      properties,
    };
  }

  private toApiProperty(property: PropertyWithDocuments) {
    const formapsTerritory = formapsTerritoryByMunicipalityId(property.formapsMunicipalityId)
      ?? resolveFormapsTerritory(
        property.provincia,
        municipalityWithSection(property.comune, property.sezioneCatastale),
      ).selected;
    const planimetria =
      property.documents.find((document) => document.type === DocumentType.PLANIMETRIA)
      ?? property.documents.find((document) => document.type === DocumentType.ELABORATO_PLANIMETRICO);
    const visura = property.documents.find((document) => document.type === DocumentType.VISURA);
    const elencoSubalterni = property.documents.find((document) => document.type === DocumentType.ELENCO_SUBALTERNI);
    const currentRendita = Number(property.currentRendita);
    const estimatedRendita = estimatedRenditaFromAnalysisDraft(property.analysisDraft) ?? Number(property.estimatedRendita);
    const currentImuCalculation = this.calculateImu(currentRendita, property);
    const estimatedImuCalculation = estimatedRendita > 0 || property.hasStudy
      ? this.calculateImu(estimatedRendita, property)
      : null;
    const currentImu = calculatedAmount(currentImuCalculation)
      ?? (property.currentImu === null ? null : Number(property.currentImu));
    const estimatedImu = calculatedAmount(estimatedImuCalculation)
      ?? (property.estimatedImu === null ? null : Number(property.estimatedImu));
    const currentImuSource = currentImuCalculation.status === "calculated"
      ? "calculated"
      : property.currentImu !== null
        ? "stored"
        : "unavailable";
    const estimatedImuSource = estimatedImuCalculation?.status === "calculated"
      ? "calculated"
      : property.estimatedImu !== null
        ? "stored"
        : "unavailable";
    return {
      id: property.id,
      address: property.address,
      comune: property.comune,
      provincia: property.provincia,
      formapsComune: formapsTerritory?.municipality ?? null,
      formapsProvincia: formapsTerritory?.provinceId ?? null,
      ubicazione: property.ubicazione,
      foglio: property.foglio,
      particella: property.particella,
      subalterno: property.subalterno,
      sezioneCatastale: property.sezioneCatastale,
      codiceComuneCatastale: property.codiceComuneCatastale,
      formapsMunicipalityId: formapsTerritory?.municipalityId ?? property.formapsMunicipalityId,
      categoria: property.categoria,
      titolarita: property.titolarita,
      currentRendita,
      estimatedRendita,
      diffPercent: currentRendita === 0 ? 0 : ((estimatedRendita - currentRendita) / currentRendita) * 100,
      currentImu,
      estimatedImu,
      imuDiff: estimatedImu === null || currentImu === null ? 0 : estimatedImu - currentImu,
      imuRateOverride: property.imuRateOverride === null ? null : Number(property.imuRateOverride),
      imuCalculation: estimatedImuCalculation,
      currentImuCalculation: currentImuSource === "calculated" ? currentImuCalculation : null,
      currentImuSource,
      estimatedImuSource,
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
        elencoSubalterni: elencoSubalterni?.fileName ?? "",
      },
      documentUrls: {
        planimetria: documentDownloadUrl(property.id, "planimetria", planimetria),
        visura: documentDownloadUrl(property.id, "visura", visura),
        elencoSubalterni: documentDownloadUrl(property.id, "elenco_subalterni", elencoSubalterni),
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

  private calculateImu(
    rendita: number,
    property: (
      Pick<Property, "categoria" | "comune" | "provincia" | "imuRateOverride">
      | (Pick<CreatePropertyInput, "categoria" | "comune" | "provincia"> & { imuRateOverride?: null })
    ),
    fallbackProvince?: string,
  ) {
    return this.imu.calculate({
      rendita,
      categoria: property.categoria,
      comune: property.comune ?? "",
      provincia: property.provincia ?? fallbackProvince,
      rateOverridePercent: property.imuRateOverride === null || property.imuRateOverride === undefined
        ? null
        : Number(property.imuRateOverride),
    });
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

function documentDownloadUrl(
  propertyId: string,
  type: "planimetria" | "visura" | "elenco_subalterni",
  document?: PropertyDocument,
) {
  if (!document || document.storageKey.startsWith("demo/")) return null;
  return `/api/properties/${encodeURIComponent(propertyId)}/documents/${type}/download`;
}

function validateCreateStudyInput(body: unknown): CreateStudyInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("Creazione studio non valida");
  }
  const input = body as Record<string, unknown>;
  const company = requiredString(input.company, "company", 160);
  const studyComune = requiredString(input.comune, "comune", 100);
  const studyProvincia = requiredString(input.provincia, "provincia", 10).toUpperCase();
  const region = requiredString(input.region, "region", 80);

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
  };
}

function validateCreatePropertyInput(body: unknown): CreatePropertyInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("Creazione immobile non valida");
  }
  const input = body as Record<string, unknown>;
  const address = requiredString(input.address, "address", 200);
  return {
    address,
    comune: optionalString(input.comune, 100) ?? undefined,
    provincia: optionalString(input.provincia, 10)?.toUpperCase(),
    ubicazione: optionalString(input.ubicazione, 220) ?? address,
    foglio: optionalString(input.foglio, 40),
    particella: optionalString(input.particella, 60),
    subalterno: optionalString(input.subalterno, 40),
    categoria: optionalString(input.categoria, 30) ?? "D/7",
    titolarita: optionalString(input.titolarita, 160),
    currentRendita: optionalNumber(input.currentRendita) ?? 0,
    estimatedRendita: optionalNumber(input.estimatedRendita) ?? 0,
    currentImu: optionalNumber(input.currentImu),
    estimatedImu: optionalNumber(input.estimatedImu),
  };
}

function validateDeletePropertiesInput(body: unknown): DeletePropertiesInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("Eliminazione immobili non valida");
  }
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.propertyIds)) throw new BadRequestException("propertyIds obbligatorio");
  const propertyIds = input.propertyIds
    .map((propertyId) => optionalString(propertyId, 120))
    .filter((propertyId): propertyId is string => Boolean(propertyId));
  const uniqueIds = Array.from(new Set(propertyIds));
  if (uniqueIds.length === 0) throw new BadRequestException("Seleziona almeno un immobile");
  return { propertyIds: uniqueIds };
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

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(normalized)) throw new BadRequestException("Valore numerico non valido");
  return normalized;
}

function parseDate(value: string, field: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} non valido`);
  return date;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function percentageDiff(currentValue: number, nextValue: number) {
  return currentValue === 0 ? 0 : ((nextValue - currentValue) / currentValue) * 100;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function calculatedAmount(calculation: ImuCalculation | null) {
  return calculation?.status === "calculated" ? calculation.amount : null;
}
