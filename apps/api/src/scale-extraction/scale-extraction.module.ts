import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { ScaleExtractionController } from "./scale-extraction.controller.js";
import { ScaleExtractionService } from "./scale-extraction.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [ScaleExtractionController],
  providers: [ScaleExtractionService],
  exports: [ScaleExtractionService],
})
export class ScaleExtractionModule {}
