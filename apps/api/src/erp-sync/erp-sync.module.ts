import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module.js";
import { AddressNormalizationModule } from "../address-normalization/address-normalization.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PriceListsModule } from "../price-lists/price-lists.module.js";
import { PresentationsModule } from "../presentations/presentations.module.js";
import { ScaleExtractionModule } from "../scale-extraction/scale-extraction.module.js";
import { VisuraExtractionModule } from "../visura-extraction/visura-extraction.module.js";
import { DocumentStorageService } from "./document-storage.service.js";
import { ErpSyncController } from "./erp-sync.controller.js";
import { ErpSyncService } from "./erp-sync.service.js";

@Module({
  imports: [
    ActivitiesModule,
    AddressNormalizationModule,
    PrismaModule,
    PriceListsModule,
    PresentationsModule,
    ScaleExtractionModule,
    VisuraExtractionModule,
  ],
  controllers: [ErpSyncController],
  providers: [DocumentStorageService, ErpSyncService],
})
export class ErpSyncModule {}
