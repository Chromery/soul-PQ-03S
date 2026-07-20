import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PriceListsModule } from "../price-lists/price-lists.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { VisuraExtractionService } from "./visura-extraction.service.js";

@Module({
  imports: [ConfigModule, PrismaModule, PriceListsModule],
  providers: [VisuraExtractionService],
  exports: [VisuraExtractionService],
})
export class VisuraExtractionModule {}
