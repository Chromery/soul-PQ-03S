import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { STUDY_OUTCOMES, type StudyOutcome } from "../study-outcome.js";

export class UpdateStudyDto {
  @IsOptional()
  @IsIn(STUDY_OUTCOMES)
  status?: StudyOutcome;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
