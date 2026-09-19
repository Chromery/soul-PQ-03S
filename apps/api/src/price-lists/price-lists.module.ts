import { Module } from "@nestjs/common";
import { DocumentStorageService } from "../erp-sync/document-storage.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PriceListsController } from "./price-lists.controller.js";
import { PriceListsService } from "./price-lists.service.js";
import { PriceRulesService } from "./price-rules.service.js";
import { PriceRulesController } from "./price-rules.controller.js";

@Module({
  imports: [PrismaModule],
  controllers: [PriceListsController, PriceRulesController],
  providers: [DocumentStorageService, PriceListsService, PriceRulesService],
  exports: [PriceListsService],
})
export class PriceListsModule {}
