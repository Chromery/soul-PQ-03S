import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StudiesService } from "./studies.service.js";
import { buildGroupingSuggestions } from "./property-grouping-suggestions.js";

const propertySelect = { id: true, valuationGroupId: true, comune: true, provincia: true, codiceComuneCatastale: true,
  sezioneCatastale: true, foglio: true, particella: true, subalterno: true } as const;

@Injectable()
export class PropertyGroupingSuggestionsService {
  constructor(private readonly prisma: PrismaService, private readonly studies: StudiesService) {}

  private async candidates(client: Prisma.TransactionClient, studyId: string) {
    const study = await client.feasibilityStudy.findUnique({ where: { id: studyId },
      select: { id: true, properties: { select: propertySelect } } });
    if (!study) throw new NotFoundException("Studio non trovato");
    return buildGroupingSuggestions(studyId, study.properties);
  }

  async list(studyId: string) {
    const candidates = await this.candidates(this.prisma, studyId);
    const rejected = await this.prisma.propertyGroupingDismissal.findMany({ where: { studyId }, select: { signature: true, rejectedAt: true } });
    const rejectedAt = new Map(rejected.map(item => [item.signature, item.rejectedAt.toISOString()]));
    return { pending: candidates.filter(item => !rejectedAt.has(item.id)),
      rejected: candidates.filter(item => rejectedAt.has(item.id)).map(item => ({ ...item, rejectedAt: rejectedAt.get(item.id) })) };
  }

  async review(studyId: string, signature: string, action: "accept" | "reject", propertyIds?: string[]) {
    if (!/^[a-f0-9]{64}$/.test(signature) || !["accept", "reject"].includes(action)) throw new BadRequestException("Suggerimento non valido");
    await this.prisma.$transaction(async tx => {
      // Serialize reviews for this study; conditional membership updates also
      // protect against grouping performed from another tab via the manual API.
      await tx.$queryRaw`SELECT id FROM "FeasibilityStudy" WHERE id = ${studyId} FOR UPDATE`;
      const suggestion = (await this.candidates(tx, studyId)).find(item => item.id === signature);
      if (!suggestion) throw new ConflictException("Il suggerimento è cambiato o è già stato accettato. Aggiorna la lista.");
      const selected = propertyIds ?? suggestion.propertyIds;
      if (action === "reject" && propertyIds !== undefined) throw new BadRequestException("Il rifiuto riguarda l'intero suggerimento");
      if (!Array.isArray(selected) || selected.length < 2 || selected.length > 1000 || new Set(selected).size !== selected.length
        || selected.some(id => !suggestion.propertyIds.includes(id))) throw new BadRequestException("Seleziona almeno due immobili del suggerimento");
      if (action === "reject") {
        await tx.propertyGroupingDismissal.upsert({ where: { studyId_signature: { studyId, signature } },
          create: { studyId, signature }, update: {} });
      } else {
        const group = await tx.propertyValuationGroup.create({ data: { studyId } });
        const result = await tx.property.updateMany({ where: { studyId, id: { in: selected }, valuationGroupId: null },
          data: { valuationGroupId: group.id } });
        if (result.count !== selected.length) throw new ConflictException("Alcuni immobili sono già raggruppati. Aggiorna la lista.");
        await tx.propertyGroupingDismissal.deleteMany({ where: { studyId, signature } });
      }
    });
    return { ...(await this.list(studyId)), study: action === "accept" ? await this.studies.find(studyId) : null };
  }
}
