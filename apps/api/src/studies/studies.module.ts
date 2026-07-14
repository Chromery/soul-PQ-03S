import { Module } from "@nestjs/common";
import { PriceListsModule } from "../price-lists/price-lists.module.js";
import { StudiesController } from "./studies.controller.js";
import { StudiesService } from "./studies.service.js";

@Module({
  imports: [PriceListsModule],
  controllers: [StudiesController],
  providers: [StudiesService],
  exports: [StudiesService],
})
export class StudiesModule {}
