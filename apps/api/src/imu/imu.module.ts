import { Global, Module } from "@nestjs/common";
import { ImuDocumentsController } from "./imu-documents.controller.js";
import { ImuDocumentsService } from "./imu-documents.service.js";
import { ImuService } from "./imu.service.js";

@Global()
@Module({
  controllers: [ImuDocumentsController],
  providers: [ImuDocumentsService, ImuService],
  exports: [ImuService],
})
export class ImuModule {}
