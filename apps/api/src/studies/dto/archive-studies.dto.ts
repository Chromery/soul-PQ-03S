import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsString, MaxLength } from "class-validator";

export class ArchiveStudiesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  studyIds!: string[];

  @IsBoolean()
  archived!: boolean;
}
