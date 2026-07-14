import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { ImuDocumentsService } from "./imu-documents.service.js";

@Controller("imu/delibere")
export class ImuDocumentsController {
  constructor(private readonly documents: ImuDocumentsService) {}

  @Get(":sha256")
  async open(@Param("sha256") sha256: string, @Res({ passthrough: true }) response: Response) {
    const document = await this.documents.open(sha256);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", contentDisposition(document.fileName));
    response.setHeader("Content-Length", String(document.contentLength));
    response.setHeader("Cache-Control", "private, max-age=86400, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(document.stream);
  }
}

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
