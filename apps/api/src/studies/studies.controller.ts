import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { StudiesService } from "./studies.service.js";

@Controller("studies")
export class StudiesController {
  constructor(private readonly studies: StudiesService) {}

  @Get()
  list() {
    return this.studies.list();
  }

  @Get(":id")
  async find(@Param("id") id: string) {
    const study = await this.studies.find(id);
    if (!study) throw new NotFoundException("Studio non trovato");
    return study;
  }
}
