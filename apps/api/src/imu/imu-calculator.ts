import { IMU_RATE_RECORDS } from "./imu-rates.generated.js";
import type { ImuCalculation, ImuCalculationInput, ImuRateRecord } from "./imu.types.js";

export const DEFAULT_IMU_YEAR = 2026;
export const CADASTRAL_REVALUATION = 1.05;

export class ImuCalculator {
  private readonly recordsByMunicipality = new Map<string, ImuRateRecord[]>();

  constructor(records: ImuRateRecord[] = IMU_RATE_RECORDS) {
    for (const record of records) {
      const key = municipalityKey(record.municipality, record.province);
      const current = this.recordsByMunicipality.get(key) ?? [];
      current.push(record);
      current.sort((first, second) => second.year - first.year);
      this.recordsByMunicipality.set(key, current);
    }
  }

  calculate(input: ImuCalculationInput): ImuCalculation {
    const targetYear = input.targetYear ?? DEFAULT_IMU_YEAR;
    const categoria = normalizeCadastralCategory(input.categoria);
    if (!Number.isFinite(input.rendita) || input.rendita < 0 || !categoria || !input.comune.trim()) {
      return { status: "unavailable", reason: "invalid_input", targetYear };
    }

    const records = this.findMunicipalityRecords(input.comune, input.provincia);
    const record = records.find((candidate) => candidate.year === targetYear)
      ?? records.find((candidate) => candidate.year === targetYear - 1);
    if (!record) return { status: "unavailable", reason: "municipality_not_found", targetYear };
    if (record.documentType !== "mef_standard_prospect") {
      return { status: "unavailable", reason: "unsupported_document", targetYear };
    }

    const rateSelection = rateForCategory(record, categoria);
    if (rateSelection.rate === null) {
      return { status: "unavailable", reason: "rate_not_found", targetYear };
    }

    const cadastralMultiplier = cadastralMultiplierForCategory(categoria);
    const taxableBase = roundCurrency(input.rendita * CADASTRAL_REVALUATION * cadastralMultiplier);
    const amount = roundCurrency(taxableBase * (rateSelection.rate / 100));
    return {
      status: "calculated",
      amount,
      taxableBase,
      cadastralMultiplier,
      ratePercent: rateSelection.rate,
      rateYear: record.year,
      usedFallback: record.year !== targetYear,
      rateKind: rateSelection.kind,
      municipality: record.municipality,
      province: record.province,
      cadastralCode: record.cadastralCode,
      actNumber: record.actNumber,
      actDate: record.actDate,
      publicationDate: record.publicationDate,
      sourcePath: record.sourcePath,
      sourceUrl: `https://github.com/Chromery/soul-delibere-rk/blob/main/${encodeURI(record.sourcePath)}`,
    };
  }

  private findMunicipalityRecords(comune: string, provincia?: string | null) {
    const exact = this.recordsByMunicipality.get(municipalityKey(comune, provincia ?? ""));
    if (exact) return exact;
    const municipality = normalizeText(comune);
    const matches = Array.from(this.recordsByMunicipality.entries())
      .filter(([key]) => key.startsWith(`${municipality}|`))
      .flatMap(([, records]) => records);
    return matches.length === 1 || new Set(matches.map((record) => record.province)).size === 1 ? matches : [];
  }
}

export function cadastralMultiplierForCategory(rawCategory: string) {
  const category = normalizeCadastralCategory(rawCategory);
  if (category === "A/10" || category === "D/5") return 80;
  if (category.startsWith("D/")) return 65;
  if (category.startsWith("B/") || ["C/3", "C/4", "C/5"].includes(category)) return 140;
  if (category === "C/1") return 55;
  return 160;
}

export function normalizeCadastralCategory(value: string) {
  const normalized = value
    .replace(/^cat(?:egoria)?\.?\s*/i, "")
    .replace(/^c\.?d\.?\s*/i, "D")
    .replace(/[.\s_-]+/g, "")
    .toUpperCase();
  const match = normalized.match(/^([A-G])(\d{1,2})$/);
  return match ? `${match[1]}/${Number(match[2])}` : normalized;
}

function rateForCategory(record: ImuRateRecord, category: string) {
  if (category === "D/10") {
    return { rate: record.ruralInstrumentalRate, kind: "rural_instrumental" as const };
  }
  if (category.startsWith("D/")) {
    return { rate: record.groupDRate, kind: "group_d" as const };
  }
  return { rate: record.otherBuildingsRate, kind: "other_buildings" as const };
}

function municipalityKey(municipality: string, province: string) {
  return `${normalizeText(municipality)}|${normalizeText(province)}`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
