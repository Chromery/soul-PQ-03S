import { Controller, Get, Post } from "@nestjs/common";
import { SystemService } from "./system.service.js";

@Controller("system")
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
