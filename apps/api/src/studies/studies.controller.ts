import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put } from "@nestjs/common";
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

  @Post(":id/properties")
  async createProperty(@Param("id") id: string, @Body() input: unknown) {
    const study = await this.studies.createProperty(id, input);
    if (!study) throw new NotFoundException("Studio non trovato");
    return study;
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

  @Delete(":id/properties")
  async deleteProperties(@Param("id") id: string, @Body() input: unknown) {
    const study = await this.studies.deleteProperties(id, input);
    if (!study) throw new NotFoundException("Studio non trovato");
    return study;
  }
}
