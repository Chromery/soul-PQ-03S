import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { HealthController } from "./health.controller.js";
import { ErpSyncModule } from "./erp-sync/erp-sync.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { PriceListsModule } from "./price-lists/price-lists.module.js";
import { PropertiesModule } from "./properties/properties.module.js";
import { ScaleExtractionModule } from "./scale-extraction/scale-extraction.module.js";
import { StudiesModule } from "./studies/studies.module.js";
import { VisuraExtractionModule } from "./visura-extraction/visura-extraction.module.js";

const rootEnvFile = fileURLToPath(new URL("../../../.env", import.meta.url));
dotenv.config({ path: rootEnvFile });
process.env.DATABASE_URL ??= localDatabaseUrl();

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: rootEnvFile, isGlobal: true }),
    PrismaModule,
    StudiesModule,
    PropertiesModule,
    PriceListsModule,
    ErpSyncModule,
    ScaleExtractionModule,
    VisuraExtractionModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

function localDatabaseUrl() {
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? "soul");
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "soul_dev_password");
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "5432";
  const database = process.env.POSTGRES_DB ?? "soul_pq";
  return `postgresql://${user}:${password}@${host}:${port}/${database}?schema=public`;
}
