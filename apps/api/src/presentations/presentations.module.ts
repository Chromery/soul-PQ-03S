import { Module } from "@nestjs/common";
import { AddressNormalizationModule } from "../address-normalization/address-normalization.module.js";
import { StudiesModule } from "../studies/studies.module.js";
import {
  PresentationsController,
  StudyGroupPresentationsController,
  StudyPresentationsController,
} from "./presentations.controller.js";
import { PresentationsService } from "./presentations.service.js";

@Module({
  imports: [AddressNormalizationModule, StudiesModule],
  controllers: [StudyPresentationsController, StudyGroupPresentationsController, PresentationsController],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}
