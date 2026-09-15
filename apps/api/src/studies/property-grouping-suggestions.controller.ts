import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { IsIn } from "class-validator";
import { PropertyGroupingSuggestionsService } from "./property-grouping-suggestions.service.js";

export class ReviewGroupingSuggestionDto {
  @IsIn(["accept", "reject"])
  action!: "accept" | "reject";
}

@Controller("studies/:studyId/property-grouping-suggestions")
export class PropertyGroupingSuggestionsController {
  constructor(private readonly suggestions: PropertyGroupingSuggestionsService) {}
  @Get()
  list(@Param("studyId") studyId: string) { return this.suggestions.list(studyId); }
  @Post(":signature")
  review(@Param("studyId") studyId: string, @Param("signature") signature: string, @Body() input: ReviewGroupingSuggestionDto) {
    return this.suggestions.review(studyId, signature, input.action);
  }
}
