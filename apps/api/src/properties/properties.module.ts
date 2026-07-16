import { Module } from "@nestjs/common";
import { DocumentStorageService } from "../erp-sync/document-storage.service.js";
import { VisuraExtractionModule } from "../visura-extraction/visura-extraction.module.js";
import { PropertiesController } from "./properties.controller.js";
import { PropertiesService } from "./properties.service.js";

@Module({
  imports: [VisuraExtractionModule],
  controllers: [PropertiesController],
  providers: [DocumentStorageService, PropertiesService],
})
export class PropertiesModule {}
