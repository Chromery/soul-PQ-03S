import { Module } from "@nestjs/common";
import { AddressNormalizationService } from "./address-normalization.service.js";

@Module({
  providers: [AddressNormalizationService],
  exports: [AddressNormalizationService],
})
export class AddressNormalizationModule {}
