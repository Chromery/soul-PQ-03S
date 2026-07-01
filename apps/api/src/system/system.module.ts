import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module.js";
import { SystemController } from "./system.controller.js";
import { SystemService } from "./system.service.js";

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
