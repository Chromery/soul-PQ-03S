import { Controller, Get, Post } from "@nestjs/common";
import { SystemService } from "./system.service.js";
import { AdminOnly } from "../auth/auth.guard.js";

@Controller("system")
@AdminOnly()
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get("status")
  getStatus() {
    return this.system.getStatus();
  }

  @Post("backups")
  createBackup() {
    return this.system.createBackup();
  }
}
