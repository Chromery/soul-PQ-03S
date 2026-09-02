import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { PresentationsService } from "../presentations/presentations.service.js";
import { ErpSyncService } from "./erp-sync.service.js";

@Controller("integrations/erp/v1")
export class ErpSyncController {
  constructor(
    private readonly erpSync: ErpSyncService,
    private readonly presentations: PresentationsService,
  ) {}

  @Post("studi/sync")
  @HttpCode(200)
  syncStudies(@Body() body: unknown, @Headers("authorization") authorization?: string) {
    this.erpSync.assertAuthorized(authorization);
    return this.erpSync.syncStudies(body);
  }

  @Get("studi/modifiche")
  listModifiedStudies(
    @Query("modificati_dopo") modifiedAfter?: string,
    @Headers("authorization") authorization?: string,
  ) {
    this.erpSync.assertAuthorized(authorization);
    return this.erpSync.listModifiedStudies(modifiedAfter);
  }

  @Get("presentazioni/:presentationId/pdf")
  async downloadV3Presentation(
    @Param("presentationId") presentationId: string,
    @Headers("authorization") authorization: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.erpSync.assertAuthorized(authorization);
    const document = await this.presentations.renderV3Pdf(presentationId);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", erpAttachmentDisposition(document.fileName));
    response.setHeader("Content-Length", String(document.pdf.byteLength));
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(document.pdf);
  }
}

function erpAttachmentDisposition(fileName: string) {
  const safeAscii = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
