export type PropertyImuCalculation =
  | {
      status: "calculated";
      amount: number;
      taxableBase: number;
      cadastralMultiplier: number;
      ratePercent: number;
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
      sourceUrl: string;
    }
  | {
      status: "unavailable";
      reason: "invalid_input" | "municipality_not_found" | "unsupported_document" | "rate_not_found";
      targetYear: number;
    };

export type ImuValueSource = "calculated" | "stored" | "unavailable";
