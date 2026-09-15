import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

export class UpdatePropertyValuationGroupDto {
  @IsIn(["add", "remove"])
  action!: "add" | "remove";
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsString({ each: true })
  propertyIds!: string[];
  @IsOptional()
  @IsBoolean()
  resetValuation?: boolean;
}
