import { Module } from "@nestjs/common";
import { DocumentStorageService } from "../erp-sync/document-storage.service.js";
import { PropertiesController } from "./properties.controller.js";
import { PropertiesService } from "./properties.service.js";

@Module({
  controllers: [PropertiesController],
  providers: [DocumentStorageService, PropertiesService],
})
export class PropertiesModule {}
