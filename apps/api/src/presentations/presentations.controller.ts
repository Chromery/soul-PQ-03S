import { Body, Controller, Get, Param, Post, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { CreatePresentationDto } from "./dto/create-presentation.dto.js";
import { PresentationsService } from "./presentations.service.js";

@Controller("studies/:studyId/presentations")
export class StudyPresentationsController {
  constructor(private readonly presentations: PresentationsService) {}

  @Get()
  list(@Param("studyId") studyId: string) {
    return this.presentations.list(studyId);
  }

  @Post()
  create(@Param("studyId") studyId: string, @Body() input: CreatePresentationDto) {
    return this.presentations.create(studyId, input.propertyIds);
  }
}

@Controller("presentations")
export class PresentationsController {
  constructor(private readonly presentations: PresentationsService) {}

  @Get(":id")
  async html(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const document = await this.presentations.renderHtml(id);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Content-Disposition", contentDisposition(document.fileName, "inline"));
    response.setHeader("Cache-Control", "private, max-age=300");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    );
    return document.html;
  }

  @Get(":id/pdf")
  async pdf(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const document = await this.presentations.renderPdf(id);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", contentDisposition(document.fileName, "attachment"));
    response.setHeader("Content-Length", String(document.pdf.byteLength));
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(document.pdf);
  }
}

function contentDisposition(fileName: string, disposition: "inline" | "attachment") {
  const safeAscii = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
