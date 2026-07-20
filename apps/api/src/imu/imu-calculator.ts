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
    const rateOverride = input.rateOverridePercent ?? null;
    if (
      !Number.isFinite(input.rendita)
      || input.rendita < 0
      || !categoria
      || !input.comune.trim()
      || (rateOverride !== null && (!Number.isFinite(rateOverride) || rateOverride < 0 || rateOverride > 10))
    ) {
      return { status: "unavailable", reason: "invalid_input", targetYear };
    }

    const cadastralMultiplier = cadastralMultiplierForCategory(categoria);
    if (cadastralMultiplier === null) {
      return { status: "unavailable", reason: "category_not_supported", targetYear };
    }

    const records = this.findMunicipalityRecords(input.comune, input.provincia);
    const record = records.find((candidate) => candidate.year === targetYear)
      ?? records.find((candidate) => candidate.year === targetYear - 1);
    if (!record && rateOverride === null) {
      return { status: "unavailable", reason: "municipality_not_found", targetYear };
    }
    if (record && record.documentType !== "mef_standard_prospect" && rateOverride === null) {
      return { status: "unavailable", reason: "unsupported_document", targetYear };
    }

    const rateSelection = record?.documentType === "mef_standard_prospect"
      ? rateForCategory(record, categoria)
      : { rate: null, kind: rateKindForCategory(categoria) };
    if (rateSelection.rate === null && rateOverride === null) {
      return { status: "unavailable", reason: "rate_not_found", targetYear };
    }

    const appliedRate = rateOverride ?? rateSelection.rate;
    if (appliedRate === null) {
      return { status: "unavailable", reason: "rate_not_found", targetYear };
    }
    const taxableBase = roundCurrency(input.rendita * CADASTRAL_REVALUATION * cadastralMultiplier);
    const amount = roundCurrency(taxableBase * (appliedRate / 100));
    return {
      status: "calculated",
      amount,
      taxableBase,
      cadastralMultiplier,
      ratePercent: appliedRate,
      systemRatePercent: rateSelection.rate,
      rateOverridden: rateOverride !== null,
      rateYear: record?.year ?? targetYear,
      usedFallback: Boolean(record && record.year !== targetYear),
      rateKind: rateSelection.kind,
      municipality: record?.municipality ?? input.comune,
      province: record?.province ?? input.provincia ?? "",
      cadastralCode: record?.cadastralCode ?? "",
      actNumber: record?.actNumber ?? "",
      actDate: record?.actDate ?? "",
      publicationDate: record?.publicationDate ?? "",
      sourcePath: record?.sourcePath ?? "",
      sourceUrl: record ? `/api/imu/delibere/${record.sha256}` : null,
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
  // Tabella ufficiale MEF, art. 1, comma 745, legge 160/2019:
  // https://www.finanze.gov.it/it/fiscalita/fiscalita-regionale-e-locale/Imposta-municipale-propria-IMU/disciplina-del-tributo/base-imponibile/
  const category = normalizeCadastralCategory(rawCategory);
  if (category === "A/10" || category === "D/5") return 80;
  if (category.startsWith("D/")) return 65;
  if (category.startsWith("B/")) return 140;
  if (category === "C/1") return 55;
  if (["C/3", "C/4", "C/5"].includes(category)) return 140;
  if (["C/2", "C/6", "C/7"].includes(category)) return 160;
  if (category.startsWith("A/")) return 160;
  return null;
}

export function normalizeCadastralCategory(value: string) {
  const normalized = value.trim().toUpperCase();
  const afterCategoryLabel = normalized.match(/CAT(?:EGORIA)?\.?\s*([A-G])\s*[\/.]?\s*(\d{1,2})/);
  const withSeparator = normalized.match(/([A-G])\s*[\/.]\s*(\d{1,2})/);
  const atEnd = normalized.match(/([A-G])\s*(\d{1,2})\s*$/);
  const match = afterCategoryLabel ?? withSeparator ?? atEnd;
  return match ? `${match[1]}/${Number(match[2])}` : "";
}

function rateForCategory(record: ImuRateRecord, category: string) {
  const kind = rateKindForCategory(category);
  if (kind === "rural_instrumental") return { rate: record.ruralInstrumentalRate, kind };
  if (kind === "group_d") return { rate: record.groupDRate, kind };
  return { rate: record.otherBuildingsRate, kind };
}

function rateKindForCategory(category: string) {
  if (category === "D/10") return "rural_instrumental" as const;
  if (category.startsWith("D/")) return "group_d" as const;
  return "other_buildings" as const;
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
