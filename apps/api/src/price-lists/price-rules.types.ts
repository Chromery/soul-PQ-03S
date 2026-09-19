export const PRICE_USAGES = [
  "capannone",
  "uffici",
  "tettoie",
  "sistemazione-esterna",
  "verde",
  "lotto",
  "interrato",
  "parcheggio-interrato",
  "parcheggio-esterno",
  "negozio",
  "commerciale",
  "laboratorio",
  "casa-di-cura",
  "hotel",
  "locali-tecnici",
  "parcheggio-multipiano",
  "custom",
] as const;
export type PriceUsage = (typeof PRICE_USAGES)[number];
export type PriceRule = {
  id: string;
  documentId: string;
  page: number;
  pageLabel?: string;
  code: string;
  label: string;
  usageIds: PriceUsage[];
  kind:
    | "building"
    | "land"
    | "site-work"
    | "equipment"
    | "adjustment"
    | "other";
  currency: "EUR" | "ITL" | "unknown";
  unit: "m2" | "m3" | "m" | "each" | "percent" | "other";
  valueMin: number;
  valueMax: number | null;
  qualifiers: string;
  quote: string;
  volumeKind: "building" | "capacity" | "none";
  ordinary: boolean;
  evidence: "exact" | "review";
  reviewReasons: string[];
  method: string;
  municipality?: string;
  zone?: string;
  reviewed?: boolean;
  includesCharges?: boolean;
  includesLand?: boolean;
  referenceScenario?: { height: number; description: string; page: number };
  semanticReview?: "supported" | "review" | "pending" | "not-required";
  formulaDependent?: boolean;
  calculation?: {
    type: "lecco-capannone";
    base: number;
    areaMin: number;
    areaMinExclusive?: boolean;
    areaMax: number | null;
    coefficient: number;
    denominator: number;
    referenceHeight: number;
    heightIncreasePercent: number;
  };
};
export type PriceDocument = {
  id: string;
  sha256: string;
  file: string;
  aliases: string[];
  format: "pdf" | "xlsx" | "txt";
  title: string;
  territory: string;
  province: string | null;
  region: string;
  year: number | null;
  epoch: string;
  includesCharges: boolean | null;
  includesLand?: boolean;
  historical: boolean;
  role: "price-list" | "supplement" | "context" | "calculator";
  pages: number;
  processedPages: number;
  candidatePages: number;
  ocrPages: number;
  rules: number;
  usableRules: number;
  reviewRules: number;
  auditedRules?: number;
  status: "extracted" | "partial" | "no-prices" | "supporting";
  notes: string[];
};
export type PriceCatalog = {
  version: string;
  generatedAt: string;
  model: string;
  promptHash: string;
  documents: PriceDocument[];
  rules: PriceRule[];
  bergamoZones: Record<string, string>;
  totals: {
    files: number;
    documents: number;
    pages: number;
    rules: number;
    exactRules: number;
    reviewRules: number;
    semanticSupported?: number;
    semanticPending?: number;
  };
};
export type PriceQuery = {
  province?: string;
  municipality?: string;
  usage?: PriceUsage;
  search?: string;
  documentId?: string;
  historical?: boolean;
  review?: boolean;
  offset?: number;
  limit?: number;
  height?: number;
  span?: number;
  area?: number;
  zone?: string;
};
