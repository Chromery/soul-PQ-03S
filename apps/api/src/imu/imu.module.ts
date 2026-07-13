import { Global, Module } from "@nestjs/common";
import { ImuService } from "./imu.service.js";

@Global()
@Module({
  providers: [ImuService],
  exports: [ImuService],
})
export class ImuModule {}
