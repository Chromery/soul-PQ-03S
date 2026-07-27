import { Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class PresentationPropertyInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  societa!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  comune!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  indirizzo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  foglioParticellaSub!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  categoria!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  renditaAttuale!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  renditaAttribuibile!: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  imuAttuale!: number | null;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  imuOttenibile!: number | null;
}

export class CreatePresentationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  propertyIds!: string[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  clientName?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique((property: PresentationPropertyInputDto) => property.id)
  @ValidateNested({ each: true })
  @Type(() => PresentationPropertyInputDto)
  properties?: PresentationPropertyInputDto[];
}
