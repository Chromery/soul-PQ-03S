import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module.js";
import { PriceListsModule } from "../price-lists/price-lists.module.js";
import { StudiesController } from "./studies.controller.js";
import { StudiesService } from "./studies.service.js";

@Module({
  imports: [ActivitiesModule, PriceListsModule],
  controllers: [StudiesController],
  providers: [StudiesService],
  exports: [StudiesService],
})
export class StudiesModule {}
