import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service.js";
import { ExternalAuthentication } from "./auth/auth.guard.js";

@Controller("health")
@ExternalAuthentication()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async status() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      database: "connected",
      authentication: process.env.CLERK_SECRET_KEY ? "clerk" : "configuration-required",
    };
  }
}
