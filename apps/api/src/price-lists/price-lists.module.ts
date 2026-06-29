import { Module } from "@nestjs/common";
import { DocumentStorageService } from "../erp-sync/document-storage.service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PriceListsController } from "./price-lists.controller.js";
import { PriceListsService } from "./price-lists.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [PriceListsController],
  providers: [DocumentStorageService, PriceListsService],
  exports: [PriceListsService],
})
export class PriceListsModule {}
