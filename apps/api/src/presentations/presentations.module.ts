import { Module } from "@nestjs/common";
import { AddressNormalizationModule } from "../address-normalization/address-normalization.module.js";
import { StudiesModule } from "../studies/studies.module.js";
import { PresentationsController, StudyPresentationsController } from "./presentations.controller.js";
import { PresentationsService } from "./presentations.service.js";

@Module({
  imports: [AddressNormalizationModule, StudiesModule],
  controllers: [StudyPresentationsController, PresentationsController],
  providers: [PresentationsService],
})
export class PresentationsModule {}
