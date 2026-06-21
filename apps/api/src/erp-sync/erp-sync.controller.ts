import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { ErpSyncService } from "./erp-sync.service.js";

@Controller("integrations/erp/v1")
export class ErpSyncController {
  constructor(private readonly erpSync: ErpSyncService) {}

  @Post("studi/sync")
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
}
