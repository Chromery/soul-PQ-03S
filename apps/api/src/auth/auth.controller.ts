import { Controller, Get, Post, Req } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedRequest } from "./auth.policy.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    const preferences = await this.prisma.userPreferences.findUnique({ where: { clerkUserId: request.pqUser.userId } });
    return { ...request.pqUser, welcomeSeenAt: preferences?.welcomeSeenAt ?? null };
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
}
