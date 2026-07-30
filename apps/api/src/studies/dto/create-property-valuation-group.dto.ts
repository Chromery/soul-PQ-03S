import { ArrayMinSize, ArrayUnique, IsArray, IsString } from "class-validator";

export class CreatePropertyValuationGroupDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique()
  @IsString({ each: true })
  propertyIds: string[];
}
