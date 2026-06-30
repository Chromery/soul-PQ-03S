import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PriceListsModule } from "../price-lists/price-lists.module.js";
import { ScaleExtractionModule } from "../scale-extraction/scale-extraction.module.js";
import { VisuraExtractionModule } from "../visura-extraction/visura-extraction.module.js";
import { DocumentStorageService } from "./document-storage.service.js";
import { ErpSyncController } from "./erp-sync.controller.js";
import { ErpSyncService } from "./erp-sync.service.js";

@Module({
  imports: [PrismaModule, PriceListsModule, ScaleExtractionModule, VisuraExtractionModule],
  controllers: [ErpSyncController],
  providers: [DocumentStorageService, ErpSyncService],
})
export class ErpSyncModule {}
