import { Module } from "@nestjs/common";
import { StudiesModule } from "../studies/studies.module.js";
import { PresentationsController, StudyPresentationsController } from "./presentations.controller.js";
import { PresentationsService } from "./presentations.service.js";

@Module({
  imports: [StudiesModule],
  controllers: [StudyPresentationsController, PresentationsController],
  providers: [PresentationsService],
})
export class PresentationsModule {}
