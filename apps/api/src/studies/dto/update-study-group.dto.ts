import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpdateStudyGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  name!: string;
}
