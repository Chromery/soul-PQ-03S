import { ArrayMinSize, ArrayUnique, IsArray, IsString } from "class-validator";

export class CreatePresentationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  propertyIds!: string[];
}
