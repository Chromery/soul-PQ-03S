import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { PropertiesService } from "./properties.service.js";

@Controller("properties")
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get(":id/analysis-draft")
  getDraft(@Param("id") propertyId: string) {
    return this.properties.getDraft(propertyId);
  }

  @Put(":id/analysis-draft")
  saveDraft(@Param("id") propertyId: string, @Body() body: unknown) {
    return this.properties.saveDraft(propertyId, body);
  }
}
