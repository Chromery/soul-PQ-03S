import { Controller, Get, Header, Query, Sse } from "@nestjs/common";
import { ActivitiesService } from "./activities.service.js";

@Controller("activities")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(@Query("limit") limit?: string) {
    const parsedLimit = Number(limit);
    return this.activities.list(Number.isFinite(parsedLimit) ? parsedLimit : 50);
  }

  @Sse("stream")
  @Header("Cache-Control", "no-cache, no-transform")
  @Header("X-Accel-Buffering", "no")
  stream() {
    return this.activities.stream();
  }
}
