import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const studyWorkflowStatuses = ["Da iniziare", "In lavorazione", "In revisione", "Concluso"] as const;

export class UpdateStudyDto {
  @IsOptional()
  @IsIn(studyWorkflowStatuses)
  status?: (typeof studyWorkflowStatuses)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
