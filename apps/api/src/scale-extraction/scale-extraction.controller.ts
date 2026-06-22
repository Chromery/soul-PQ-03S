import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ScaleExtractionService } from "./scale-extraction.service.js";

@Controller("properties/:propertyId/scale-extraction-jobs")
export class ScaleExtractionController {
  constructor(private readonly scaleExtraction: ScaleExtractionService) {}

  @Get()
  list(@Param("propertyId") propertyId: string) {
    return this.scaleExtraction.getJobs(propertyId);
  }

  @Get("latest")
  latest(@Param("propertyId") propertyId: string) {
    return this.scaleExtraction.getLatestJob(propertyId);
  }

  @Get(":jobId")
  get(@Param("propertyId") propertyId: string, @Param("jobId") jobId: string) {
    return this.scaleExtraction.getJob(propertyId, jobId);
  }

  @Post()
  create(@Param("propertyId") propertyId: string, @Body() body: unknown, @Query("wait") wait?: string) {
    return this.scaleExtraction.createFromBase64(propertyId, body, wait === "true");
  }
}
