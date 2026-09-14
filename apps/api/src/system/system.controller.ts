import { Controller, Get, Post, Res, StreamableFile } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import type { Response } from "express";
import { SystemService } from "./system.service.js";
import { AdminOnly } from "../auth/auth.guard.js";

@Controller("system")
@AdminOnly()
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get("status")
  getStatus() {
    return this.system.getStatus();
  }

  @Get("erp-openapi")
  async downloadErpOpenapi(@Res({ passthrough: true }) response: Response) {
    const content = await readFile(new URL("../../../../docs/openapi/erp-pq-sync.openapi.yaml", import.meta.url));
    response.setHeader("Content-Type", "application/yaml; charset=utf-8");
    response.setHeader("Content-Disposition", 'attachment; filename="erp-pq-sync.openapi.yaml"');
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(content);
  }

  @Post("backups")
  createBackup() {
    return this.system.createBackup();
  }
}
