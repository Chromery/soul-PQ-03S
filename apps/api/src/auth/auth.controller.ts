import { Controller, Get, Post, Req } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedRequest } from "./auth.policy.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    const preferences = await this.prisma.userPreferences.findUnique({ where: { clerkUserId: request.pqUser.userId } });
    return { ...request.pqUser, welcomeSeenAt: preferences?.welcomeSeenAt ?? null,
      soulMigrationWelcomeSeenAt: preferences?.soulMigrationWelcomeSeenAt ?? null };
  }
  @Post("welcome-seen")
  async welcomeSeen(@Req() request: AuthenticatedRequest) {
    const preferences = await this.prisma.userPreferences.upsert({
      where: { clerkUserId: request.pqUser.userId },
      create: { clerkUserId: request.pqUser.userId, welcomeSeenAt: new Date() },
      update: {},
    });
    return { welcomeSeenAt: preferences.welcomeSeenAt };
  }

  @Post("soul-migration-welcome-seen")
  async soulMigrationWelcomeSeen(@Req() request: AuthenticatedRequest) {
    const clerkUserId = request.pqUser.userId;
    await this.prisma.userPreferences.upsert({ where: { clerkUserId },
      create: { clerkUserId }, update: {} });
    await this.prisma.userPreferences.updateMany({
      where: { clerkUserId, soulMigrationWelcomeSeenAt: null },
      data: { soulMigrationWelcomeSeenAt: new Date() },
    });
    const preferences = await this.prisma.userPreferences.findUniqueOrThrow({ where: { clerkUserId } });
    return { soulMigrationWelcomeSeenAt: preferences.soulMigrationWelcomeSeenAt };
  }
}
