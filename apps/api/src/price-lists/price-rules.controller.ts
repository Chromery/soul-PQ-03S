import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
import { PRICE_USAGES } from "./price-rules.types.js";
import type { PriceQuery, PriceUsage } from "./price-rules.types.js";
import { PriceRulesService } from "./price-rules.service.js";

export function parsePriceQuery(raw: Record<string, unknown>): PriceQuery {
  const result: Record<string, unknown> = {};
  const allowed = new Set([
    "province",
    "municipality",
    "usage",
    "search",
    "documentId",
    "historical",
    "review",
    "offset",
    "limit",
    "height",
    "span",
    "area",
    "zone",
  ]);
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key) || typeof value !== "string" || value.length > 250)
      throw new BadRequestException("Filtro prezzario non valido");
    if (["historical", "review"].includes(key)) {
      if (!["true", "false"].includes(value))
        throw new BadRequestException("Flag non valido");
      result[key] = value === "true";
    } else if (["offset", "limit", "height", "span", "area"].includes(key)) {
      const n = Number(value);
      const max =
        key === "limit"
          ? 100
          : key === "height" || key === "span"
            ? 200
            : key === "area"
              ? 1e8
              : 1e6;
      if (
        !value.trim() ||
        !Number.isFinite(n) ||
        n < (key === "offset" ? 0 : 0.01) ||
        n > max ||
        (["offset", "limit"].includes(key) && !Number.isInteger(n))
      )
        throw new BadRequestException("Parametro numerico non valido");
      result[key] = n;
    } else result[key] = value.trim();
  }
  if (result.province && !/^[A-Z]{2}$/.test(String(result.province)))
    throw new BadRequestException("Provincia non valida");
  if (result.usage && !PRICE_USAGES.includes(result.usage as PriceUsage))
    throw new BadRequestException("Destinazione non valida");
  if (result.documentId && !/^[a-f0-9]{64}$/.test(String(result.documentId)))
    throw new BadRequestException("Documento non valido");
  if (result.zone && !/^[A-E]$/.test(String(result.zone)))
    throw new BadRequestException("Zona non valida");
  return result as PriceQuery;
}

// Global Clerk AuthGuard applies to every endpoint; no public/external-auth bypass.
@Controller("price-rules")
export class PriceRulesController {
  constructor(private readonly service: PriceRulesService) {}
  @Get("catalog") catalog() {
    return this.service.summary();
  }
  @Get("export.csv") export(@Res({ passthrough: true }) response: Response) {
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="pq-prezzari-revisione.csv"',
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(Buffer.from(this.service.exportCsv(), "utf8"));
  }
  @Get("context") context(@Query() query: Record<string, unknown>) {
    for (const [key, value] of Object.entries(query))
      if (
        !["province", "municipality"].includes(key) ||
        typeof value !== "string" ||
        value.length > 250
      )
        throw new BadRequestException("Territorio non valido");
    return this.service.context(
      String(query.province || ""),
      String(query.municipality || ""),
    );
  }
  @Get("suggestions") suggestions(@Query() query: Record<string, unknown>) {
    return this.service.suggestions(parsePriceQuery(query));
  }
  @Get("documents/:id/source") async source(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.source(id);
    response.setHeader("Content-Type", file.mime);
    response.setHeader("Content-Length", file.data.length);
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    return new StreamableFile(file.data);
  }
}
