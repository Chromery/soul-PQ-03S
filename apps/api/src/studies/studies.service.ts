import { Injectable } from "@nestjs/common";
import { DocumentType } from "../generated/prisma/enums.js";
import type { FeasibilityStudy, Property, PropertyDocument, StudyVersion } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateStudyDto } from "./dto/update-study.dto.js";

type PropertyWithDocuments = Property & { documents: PropertyDocument[] };
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
        properties: { include: { documents: true }, orderBy: { id: "asc" } },
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
        properties: { include: { documents: true }, orderBy: { id: "asc" } },
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
        properties: { include: { documents: true }, orderBy: { id: "asc" } },
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });
    return this.toApiStudy(study);
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
      categoria: property.categoria,
      currentRendita: Number(property.currentRendita),
      estimatedRendita: Number(property.estimatedRendita),
      diffPercent: Number(property.diffPercent),
      imuDiff: Number(property.imuDiff),
      outcome: property.outcome,
      hasStudy: property.hasStudy,
      documents: {
        planimetria: planimetria?.fileName ?? "",
        visura: visura?.fileName ?? "",
      },
    };
  }
}
