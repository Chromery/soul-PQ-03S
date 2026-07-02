import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module.js";
import { VisuraExtractionService } from "./visura-extraction.service.js";

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [VisuraExtractionService],
  exports: [VisuraExtractionService],
})
export class VisuraExtractionModule {}
