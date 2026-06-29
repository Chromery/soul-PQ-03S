import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller.js";
import { ErpSyncModule } from "./erp-sync/erp-sync.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { PriceListsModule } from "./price-lists/price-lists.module.js";
import { PropertiesModule } from "./properties/properties.module.js";
import { ScaleExtractionModule } from "./scale-extraction/scale-extraction.module.js";
import { StudiesModule } from "./studies/studies.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StudiesModule,
    PropertiesModule,
    PriceListsModule,
    ErpSyncModule,
    ScaleExtractionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
