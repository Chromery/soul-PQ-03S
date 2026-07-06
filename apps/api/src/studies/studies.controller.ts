import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Put } from "@nestjs/common";
import { ReorderStudyPropertiesDto } from "./dto/reorder-study-properties.dto.js";
import { UpdateStudyDto } from "./dto/update-study.dto.js";
import { StudiesService } from "./studies.service.js";

@Controller("studies")
export class StudiesController {
  constructor(private readonly studies: StudiesService) {}

  @Get()
  list() {
    return this.studies.list();
  }

  @Post()
  create(@Body() input: unknown) {
    return this.studies.create(input);
  }

  @Get(":id")
  async find(@Param("id") id: string) {
    const study = await this.studies.find(id);
    if (!study) throw new NotFoundException("Studio non trovato");
    return study;
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() input: UpdateStudyDto) {
    const study = await this.studies.update(id, input);
    if (!study) throw new NotFoundException("Studio non trovato");
    return study;
  }

  @Put(":id/properties/order")
  async reorderProperties(@Param("id") id: string, @Body() input: ReorderStudyPropertiesDto) {
    const study = await this.studies.reorderProperties(id, input.propertyIds);
    if (!study) throw new NotFoundException("Studio non trovato");
    return study;
  }
}
