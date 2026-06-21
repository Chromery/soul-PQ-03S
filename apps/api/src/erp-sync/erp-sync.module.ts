import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { DocumentStorageService } from "./document-storage.service.js";
import { ErpSyncController } from "./erp-sync.controller.js";
import { ErpSyncService } from "./erp-sync.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [ErpSyncController],
  providers: [DocumentStorageService, ErpSyncService],
})
export class ErpSyncModule {}
