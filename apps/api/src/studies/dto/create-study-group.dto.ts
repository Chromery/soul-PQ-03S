import { ArrayMinSize, ArrayUnique, IsArray, IsString } from "class-validator";

export class CreateStudyGroupDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique()
  @IsString({ each: true })
  studyIds: string[];
}
