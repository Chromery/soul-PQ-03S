import { Injectable } from "@nestjs/common";
import { concat, map, Observable, of, Subject } from "rxjs";
import { PrismaService } from "../prisma/prisma.service.js";

export const ACTIVITY_TYPES = {
  ERP_SYNC: "ERP_SYNC",
  STUDY_CONCLUDED: "STUDY_CONCLUDED",
} as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

export type ActivityEventDto = {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  source: "ERP" | "PQ";
  studyIds: string[];
  metadata: Record<string, string | number | boolean | null> | null;
  createdAt: string;
};

type ActivityMetadata = Record<string, string | number | boolean | null>;

@Injectable()
export class ActivitiesService {
  private readonly updates = new Subject<ActivityEventDto>();

  constructor(private readonly prisma: PrismaService) {}

  async list(limit = 50) {
    const normalizedLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
    const events = await this.prisma.activityEvent.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: normalizedLimit,
    });
    return { items: events.map(toActivityDto) };
  }

  stream(): Observable<{ type: string; data: ActivityEventDto | { connectedAt: string } }> {
    return concat(
      of({ type: "ready", data: { connectedAt: new Date().toISOString() } }),
      this.updates.pipe(map((activity) => ({ type: "activity", data: activity }))),
    );
  }

  async recordErpSync(input: {
    studyIds: string[];
    createdCount: number;
    updatedCount: number;
  }) {
    const studyIds = uniqueStudyIds(input.studyIds);
    const count = studyIds.length;
    const title = count === 1
      ? "1 studio sincronizzato dall’ERP"
      : `${count} studi sincronizzati dall’ERP`;
    const actionSummary = [
      input.createdCount > 0
        ? `${input.createdCount} ${input.createdCount === 1 ? "nuovo" : "nuovi"}`
        : null,
      input.updatedCount > 0
        ? `${input.updatedCount} ${input.updatedCount === 1 ? "aggiornato" : "aggiornati"}`
        : null,
    ].filter(Boolean).join(", ");
    const description = `${studyIds.join(", ")}${actionSummary ? ` · ${actionSummary}` : ""}`;
    return this.record({
      type: ACTIVITY_TYPES.ERP_SYNC,
      title,
      description,
      source: "ERP",
      studyIds,
      metadata: {
        studyCount: count,
        createdCount: input.createdCount,
        updatedCount: input.updatedCount,
      },
    });
  }

  async recordStudyConcluded(input: { studyId: string; company: string; source: "ERP" | "PQ" }) {
    return this.record({
      type: ACTIVITY_TYPES.STUDY_CONCLUDED,
      title: `Studio ${input.studyId} impostato come concluso`,
      description: input.company,
      source: input.source,
      studyIds: [input.studyId],
      metadata: null,
    });
  }

  private async record(input: {
    type: ActivityType;
    title: string;
    description: string;
    source: "ERP" | "PQ";
    studyIds: string[];
    metadata: ActivityMetadata | null;
  }) {
    const stored = await this.prisma.activityEvent.create({
      data: {
        type: input.type,
        title: input.title,
        description: input.description,
        source: input.source,
        studyIds: input.studyIds,
        metadata: input.metadata ?? undefined,
      },
    });
    const activity = toActivityDto(stored);
    this.updates.next(activity);
    return activity;
  }
}

function uniqueStudyIds(studyIds: string[]) {
  return Array.from(new Set(studyIds.map((studyId) => studyId.trim()).filter(Boolean)));
}

function toActivityDto(event: {
  id: string;
  type: string;
  title: string;
  description: string;
  source: string;
  studyIds: unknown;
  metadata: unknown;
  createdAt: Date;
}): ActivityEventDto {
  return {
    id: event.id,
    type: event.type === ACTIVITY_TYPES.STUDY_CONCLUDED
      ? ACTIVITY_TYPES.STUDY_CONCLUDED
      : ACTIVITY_TYPES.ERP_SYNC,
    title: event.title,
    description: event.description,
    source: event.source === "ERP" ? "ERP" : "PQ",
    studyIds: Array.isArray(event.studyIds)
      ? event.studyIds.filter((studyId): studyId is string => typeof studyId === "string")
      : [],
    metadata: isActivityMetadata(event.metadata) ? event.metadata : null,
    createdAt: event.createdAt.toISOString(),
  };
}

function isActivityMetadata(value: unknown): value is ActivityMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => (
    item === null || ["string", "number", "boolean"].includes(typeof item)
  ));
}
