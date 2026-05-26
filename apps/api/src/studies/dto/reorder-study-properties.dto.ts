import { ArrayNotEmpty, ArrayUnique, IsArray, IsString } from "class-validator";

export class ReorderStudyPropertiesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  propertyIds: string[];
}
