export type ImuRateRecord = {
  cadastralCode: string;
  municipality: string;
  province: string;
  region: string;
  year: number;
  documentType: "mef_standard_prospect" | "municipal_resolution";
  groupDRate: number | null;
  ruralInstrumentalRate: number | null;
  otherBuildingsRate: number | null;
  actNumber: string;
  actDate: string;
  publicationDate: string;
  sourcePath: string;
  sha256: string;
};

export type ImuCalculation =
  | {
      status: "calculated";
      amount: number;
      taxableBase: number;
      cadastralMultiplier: number;
      ratePercent: number;
      systemRatePercent: number | null;
      rateOverridden: boolean;
      rateYear: number;
      usedFallback: boolean;
      rateKind: "group_d" | "rural_instrumental" | "other_buildings";
      municipality: string;
      province: string;
      cadastralCode: string;
      actNumber: string;
      actDate: string;
      publicationDate: string;
      sourcePath: string;
      sourceUrl: string | null;
    }
  | {
      status: "unavailable";
      reason: "invalid_input" | "category_not_supported" | "municipality_not_found" | "unsupported_document" | "rate_not_found";
      targetYear: number;
    };

export type ImuCalculationInput = {
  rendita: number;
  categoria: string;
  comune: string;
  provincia?: string | null;
  targetYear?: number;
  rateOverridePercent?: number | null;
};
