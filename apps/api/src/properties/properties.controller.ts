import { Body, Controller, Delete, Get, Param, Patch, Put, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
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

  @Patch(":id")
  updateProperty(@Param("id") propertyId: string, @Body() body: unknown) {
    return this.properties.updateProperty(propertyId, body);
  }

  @Put(":id/documents/:type")
  uploadDocument(@Param("id") propertyId: string, @Param("type") documentType: string, @Body() body: unknown) {
    return this.properties.uploadDocument(propertyId, documentType, body);
  }

  @Get(":id/documents/:type/download")
  async downloadDocument(
    @Param("id") propertyId: string,
    @Param("type") documentType: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const document = await this.properties.openDocument(propertyId, documentType);
    response.setHeader("Content-Type", document.contentType);
    response.setHeader("Content-Disposition", contentDisposition(document.fileName));
    response.setHeader("Cache-Control", "private, max-age=60");
    if (document.contentLength !== undefined) {
      response.setHeader("Content-Length", String(document.contentLength));
    }
    return new StreamableFile(document.stream);
  }

  @Delete(":id/documents/:type")
  deleteDocument(@Param("id") propertyId: string, @Param("type") documentType: string) {
    return this.properties.deleteDocument(propertyId, documentType);
  }
}

@Controller("property-valuation-groups")
export class PropertyValuationGroupsController {
  constructor(private readonly properties: PropertiesService) {}

  @Get(":id/analysis-draft")
  getDraft(@Param("id") valuationGroupId: string) {
    return this.properties.getValuationGroupDraft(valuationGroupId);
  }

  @Put(":id/analysis-draft")
  saveDraft(@Param("id") valuationGroupId: string, @Body() body: unknown) {
    return this.properties.saveValuationGroupDraft(valuationGroupId, body);
  }

  @Get(":id/documents/planimetria/download")
  async downloadCombinedPlan(
    @Param("id") valuationGroupId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const document = await this.properties.openValuationGroupPlan(valuationGroupId);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", contentDisposition(document.fileName));
    response.setHeader("Content-Length", String(document.buffer.byteLength));
    response.setHeader("Cache-Control", "private, max-age=60");
    response.setHeader("X-Soul-PQ-Included-Properties", document.includedPropertyIds.join(","));
    response.setHeader("X-Soul-PQ-Missing-Properties", document.missingPropertyIds.join(","));
    return new StreamableFile(document.buffer);
  }
}

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
