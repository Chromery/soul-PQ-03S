import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { AdminOnly } from "../auth/auth.guard.js";
import { ErpAuditService } from "./erp-audit.service.js";

@Controller("system/erp-audit")
@AdminOnly()
export class ErpAuditController {
  constructor(private readonly audit: ErpAuditService) {}
  @Get()
  list(@Query("study_id") studyId: string | undefined, @Query("sync_id") syncId: string | undefined,
    @Query("limit") limit: string | undefined, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "no-store");
    return this.audit.list(studyId, syncId, limit === undefined ? 50 : Number(limit));
  }
  @Get(":id")
  get(@Param("id") id: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "no-store"); return this.audit.get(id);
  }
}
