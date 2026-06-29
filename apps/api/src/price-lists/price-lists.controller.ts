import { Controller, Get, Param, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { PriceListsService } from "./price-lists.service.js";

@Controller("price-lists")
export class PriceListsController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get(":id/download")
  async download(@Param("id") id: string, @Res({ passthrough: true }) response: Response) {
    const document = await this.priceLists.openPriceList(id);
    response.setHeader("Content-Type", document.contentType);
    response.setHeader("Content-Disposition", contentDisposition(document.fileName));
    response.setHeader("Cache-Control", "private, max-age=3600");
    if (document.contentLength !== undefined) {
      response.setHeader("Content-Length", String(document.contentLength));
    }
    return new StreamableFile(document.stream);
  }
}

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
