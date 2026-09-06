import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./auth.guard.js";

@Module({ imports: [PrismaModule], controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }] })
export class AuthModule {}
