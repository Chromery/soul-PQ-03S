import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { VisuraExtractionService } from "./visura-extraction.service.js";

@Module({
  imports: [ConfigModule],
  providers: [VisuraExtractionService],
  exports: [VisuraExtractionService],
})
export class VisuraExtractionModule {}
