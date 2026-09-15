import { Module } from "@nestjs/common";
import { ActivitiesModule } from "../activities/activities.module.js";
import { PriceListsModule } from "../price-lists/price-lists.module.js";
import { StudiesController } from "./studies.controller.js";
import { StudiesService } from "./studies.service.js";
import { PropertyGroupingSuggestionsService } from "./property-grouping-suggestions.service.js";
import { PropertyGroupingSuggestionsController } from "./property-grouping-suggestions.controller.js";

@Module({
  imports: [ActivitiesModule, PriceListsModule],
  controllers: [StudiesController, PropertyGroupingSuggestionsController],
  providers: [StudiesService, PropertyGroupingSuggestionsService],
  exports: [StudiesService],
})
export class StudiesModule {}
