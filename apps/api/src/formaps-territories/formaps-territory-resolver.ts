import { readFileSync } from "node:fs";

type FormapsItem = {
  id: string;
  text: string;
};

type FormapsProvince = FormapsItem & {
  comuni: FormapsItem[];
};

type FormapsCatalog = {
  generatedAt: string;
  sha256: string;
  provinceCount: number;
  municipalityCount: number;
  provinces: FormapsProvince[];
};

export type FormapsTerritoryCandidate = {
  provinceId: string;
  province: string;
  municipalityId: string;
  municipality: string;
  score: number;
  provinceScore: number;
  municipalityScore: number;
};

export type FormapsTerritoryResolution = {
  input: {
    province: string;
    municipality: string;
  };
  exactMatch: boolean;
  strategy: "exact" | "normalized" | "fuzzy" | "ambiguous" | "unresolved";
  selected: FormapsTerritoryCandidate | null;
  candidates: FormapsTerritoryCandidate[];
};

const catalog = loadCatalog();
const provinceById = new Map(catalog.provinces.map((province) => [province.id, province]));
const municipalityCandidates: FormapsTerritoryCandidate[] = catalog.provinces.flatMap((province) =>
  province.comuni.map((municipality) => ({
    provinceId: province.id,
    province: province.text,
    municipalityId: municipality.id,
    municipality: municipality.text,
    score: 0,
    provinceScore: 0,
    municipalityScore: 0,
  })),
);
const municipalityById = new Map(
  municipalityCandidates.map((candidate) => [candidate.municipalityId.toUpperCase(), candidate]),
);
const candidatesByMunicipalityKey = indexMunicipalities(municipalityCandidates);
const resolutionCache = new Map<string, FormapsTerritoryResolution>();

export const FORMAPS_CATALOG_METADATA = Object.freeze({
  generatedAt: catalog.generatedAt,
  sha256: catalog.sha256,
  provinceCount: catalog.provinceCount,
  municipalityCount: catalog.municipalityCount,
});

export function resolveFormapsTerritory(
  provinceInput: string | null | undefined,
  municipalityInput: string | null | undefined,
  candidateLimit = 8,
): FormapsTerritoryResolution {
  const province = cleanInput(provinceInput);
  const municipality = cleanMunicipalityInput(municipalityInput);
  const limit = Math.max(1, Math.min(20, Math.round(candidateLimit)));
  const cacheKey = `${compactKey(province)}|${compactKey(municipality)}|${limit}`;
  const cached = resolutionCache.get(cacheKey);
  if (cached) return cached;

  if (!municipality) {
    return cacheResolution(cacheKey, {
      input: { province, municipality },
      exactMatch: false,
      strategy: "unresolved",
      selected: null,
      candidates: [],
    });
  }

  const municipalityKey = compactKey(municipality);
  const exactMunicipalities = candidatesByMunicipalityKey.get(municipalityKey)
    ?? candidatesByMunicipalityKey.get(compactMunicipalityBase(municipality));
  const sourceCandidates = exactMunicipalities?.length ? exactMunicipalities : municipalityCandidates;
  const ranked = sourceCandidates
    .map((candidate) => scoreCandidate(candidate, province, municipality))
    .filter((candidate) => candidate.municipalityScore >= (exactMunicipalities?.length ? 0.98 : 0.35))
    .sort(compareCandidates)
    .slice(0, limit);
  const first = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  if (!first) {
    return cacheResolution(cacheKey, {
      input: { province, municipality },
      exactMatch: false,
      strategy: "unresolved",
      selected: null,
      candidates: [],
    });
  }

  const exactProvince = provinceMatches(province, first.provinceId, first.province);
  const exactMunicipality = compactKey(municipality) === compactKey(first.municipality);
  const exactMatch = exactProvince && exactMunicipality;
  const gap = first.score - (second?.score ?? 0);
  const uniqueExactMunicipality = exactMunicipality
    && ranked.filter((candidate) => compactKey(candidate.municipality) === compactKey(municipality)).length === 1;
  const hasExactUnsectionedCandidate = ranked.some((candidate) => (
    !hasCadastralSection(candidate.municipality)
    && compactKey(candidate.municipality) === compactKey(municipality)
  ));
  const missingCadastralSection = !hasCadastralSection(municipality)
    && !hasExactUnsectionedCandidate
    && ranked.filter((candidate) => (
      hasCadastralSection(candidate.municipality)
      && compactMunicipalityBase(candidate.municipality) === compactMunicipalityBase(municipality)
    )).length > 1;
  const normalizedMatch = exactMunicipality
    && (exactProvince || uniqueExactMunicipality || first.provinceScore >= 0.9 || gap >= 0.08);
  const confidentFuzzy = first.score >= 0.86
    && first.municipalityScore >= 0.82
    && (gap >= 0.035 || first.provinceScore >= 0.98);

  const strategy = missingCadastralSection
    ? "ambiguous"
    : exactMatch
      ? "exact"
      : normalizedMatch
        ? "normalized"
        : confidentFuzzy
          ? "fuzzy"
          : first.score >= 0.55
            ? "ambiguous"
            : "unresolved";
  return cacheResolution(cacheKey, {
    input: { province, municipality },
    exactMatch,
    strategy,
    selected: ["exact", "normalized", "fuzzy"].includes(strategy) ? first : null,
    candidates: ranked,
  });
}

export function formapsProvinceName(provinceId: string) {
  return provinceById.get(provinceId.trim().toUpperCase())?.text ?? null;
}

export function formapsTerritoryByMunicipalityId(municipalityId: string | null | undefined) {
  const id = municipalityId?.trim().toUpperCase();
  if (!id) return null;
  return municipalityById.get(id) ?? null;
}

function scoreCandidate(
  candidate: FormapsTerritoryCandidate,
  provinceInput: string,
  municipalityInput: string,
): FormapsTerritoryCandidate {
  const provinceScore = provinceSimilarity(provinceInput, candidate.provinceId, candidate.province);
  const municipalityScore = municipalitySimilarity(municipalityInput, candidate.municipality);
  const sectionPenalty = !hasCadastralSection(municipalityInput) && hasCadastralSection(candidate.municipality)
    ? 0.008
    : 0;
  return {
    ...candidate,
    provinceScore: roundedScore(provinceScore),
    municipalityScore: roundedScore(municipalityScore),
    score: roundedScore(Math.max(0, municipalityScore * 0.82 + provinceScore * 0.18 - sectionPenalty)),
  };
}

function provinceSimilarity(input: string, provinceId: string, provinceName: string) {
  if (!input) return 0.5;
  const normalizedId = compactKey(input);
  if (normalizedId === compactKey(provinceId) || normalizedId === compactKey(provinceName)) return 1;
  const aliasIds = PROVINCE_CADASTRAL_ALIASES[normalizedId] ?? [];
  if (aliasIds.includes(provinceId)) return 0.97;
  return Math.max(
    textSimilarity(input, provinceName),
    normalizedId.length <= 3 ? textSimilarity(input, provinceId) * 0.9 : 0,
  );
}

function provinceMatches(input: string, provinceId: string, provinceName: string) {
  const normalized = compactKey(input);
  return Boolean(normalized)
    && (normalized === compactKey(provinceId) || normalized === compactKey(provinceName));
}

function municipalitySimilarity(input: string, candidate: string) {
  if (compactKey(input) === compactKey(candidate)) return 1;
  const inputBase = municipalityBase(input);
  const candidateBase = municipalityBase(candidate);
  if (compactKey(inputBase) === compactKey(candidateBase)) {
    return hasCadastralSection(input) === hasCadastralSection(candidate) ? 0.995 : 0.985;
  }
  return Math.max(
    textSimilarity(input, candidate),
    textSimilarity(inputBase, candidateBase) * 0.99,
  );
}

function textSimilarity(firstValue: string, secondValue: string) {
  const first = compactKey(firstValue);
  const second = compactKey(secondValue);
  if (!first || !second) return 0;
  if (first === second) return 1;
  const editSimilarity = 1 - levenshteinDistance(first, second) / Math.max(first.length, second.length);
  const diceSimilarity = diceCoefficient(first, second);
  const firstTokens = normalizedTokens(firstValue);
  const secondTokens = normalizedTokens(secondValue);
  const tokenSimilarity = jaccard(firstTokens, secondTokens);
  const shorter = Math.min(first.length, second.length);
  const containment = first.includes(second) || second.includes(first)
    ? shorter / Math.max(first.length, second.length)
    : 0;
  return Math.max(
    editSimilarity * 0.55 + diceSimilarity * 0.35 + tokenSimilarity * 0.1,
    containment >= 0.72 ? containment * 0.94 : 0,
  );
}

function compareCandidates(first: FormapsTerritoryCandidate, second: FormapsTerritoryCandidate) {
  return second.score - first.score
    || second.municipalityScore - first.municipalityScore
    || second.provinceScore - first.provinceScore
    || Number(hasCadastralSection(first.municipality)) - Number(hasCadastralSection(second.municipality))
    || first.municipality.localeCompare(second.municipality, "it");
}

function indexMunicipalities(candidates: FormapsTerritoryCandidate[]) {
  const index = new Map<string, FormapsTerritoryCandidate[]>();
  for (const candidate of candidates) {
    for (const key of new Set([
      compactKey(candidate.municipality),
      compactMunicipalityBase(candidate.municipality),
    ])) {
      const current = index.get(key) ?? [];
      current.push(candidate);
      index.set(key, current);
    }
  }
  return index;
}

function loadCatalog(): FormapsCatalog {
  const fileUrl = new URL("./formaps-territories.generated.json", import.meta.url);
  const parsed = JSON.parse(readFileSync(fileUrl, "utf8")) as FormapsCatalog;
  if (
    !Array.isArray(parsed.provinces)
    || parsed.provinces.length !== parsed.provinceCount
    || parsed.provinceCount < 90
    || parsed.municipalityCount < 7_000
  ) {
    throw new Error("Catalogo province/comuni forMaps non valido o incompleto");
  }
  const actualMunicipalityCount = parsed.provinces.reduce(
    (total, province) => total + province.comuni.length,
    0,
  );
  if (actualMunicipalityCount !== parsed.municipalityCount) {
    throw new Error("Conteggio comuni del catalogo forMaps non coerente");
  }
  return parsed;
}

function cacheResolution(key: string, resolution: FormapsTerritoryResolution) {
  if (resolutionCache.size >= 2_000) resolutionCache.clear();
  resolutionCache.set(key, resolution);
  return resolution;
}

function cleanInput(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^\s*(?:PROVINCIA|PROV\.)\s+(?:DI\s+)?/i, "")
    .replace(/\s*\((?:PROVINCIA|SIGLA)?\s*:?[A-Z]{2}\)\s*$/i, "")
    .trim();
}

function cleanMunicipalityInput(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/^\s*COMUNE\s+(?:DI\s+)?/i, "")
    .replace(/\s*\(\s*CODICE(?:\s+CATASTALE)?\s*:[^)]+\)\s*$/i, "")
    .replace(/\s*\(\s*[A-Z][0-9]{3}[A-Z]?\s*\)\s*$/i, "")
    .trim();
}

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleUpperCase("it-IT")
    .replace(/[’`´]/g, "'")
    .replace(/\bSEZIONE\b/g, "SEZ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function compactKey(value: string) {
  return normalizedText(value).replace(/\s+/g, "");
}

function normalizedTokens(value: string) {
  return new Set(normalizedText(value).split(/\s+/).filter(Boolean));
}

function municipalityBase(value: string) {
  return value.replace(/\s*\/\s*(?:SEZ\.?|SEZIONE)\s*[A-Z0-9-]+\s*$/i, "").trim();
}

function compactMunicipalityBase(value: string) {
  return compactKey(municipalityBase(value));
}

function hasCadastralSection(value: string) {
  return /\/\s*(?:SEZ\.?|SEZIONE)\s*[A-Z0-9-]+\s*$/i.test(value);
}

function roundedScore(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}

function levenshteinDistance(first: string, second: string) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  const current = new Array<number>(second.length + 1);
  for (let row = 1; row <= first.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= second.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1),
      );
    }
    for (let column = 0; column <= second.length; column += 1) previous[column] = current[column];
  }
  return previous[second.length];
}

function diceCoefficient(first: string, second: string) {
  if (first.length < 2 || second.length < 2) return first === second ? 1 : 0;
  const firstBigrams = new Map<string, number>();
  for (let index = 0; index < first.length - 1; index += 1) {
    const bigram = first.slice(index, index + 2);
    firstBigrams.set(bigram, (firstBigrams.get(bigram) ?? 0) + 1);
  }
  let intersection = 0;
  for (let index = 0; index < second.length - 1; index += 1) {
    const bigram = second.slice(index, index + 2);
    const count = firstBigrams.get(bigram) ?? 0;
    if (count > 0) {
      firstBigrams.set(bigram, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (first.length + second.length - 2);
}

function jaccard(first: Set<string>, second: Set<string>) {
  if (first.size === 0 || second.size === 0) return 0;
  let intersection = 0;
  for (const token of first) if (second.has(token)) intersection += 1;
  return intersection / (first.size + second.size - intersection);
}

const PROVINCE_CADASTRAL_ALIASES: Record<string, string[]> = {
  BARLETTAANDRIATRANI: ["BA"],
  BT: ["BA"],
  CARBONIAIGLESIAS: ["CA"],
  CI: ["CA"],
  FC: ["FO"],
  FERMO: ["AP"],
  FM: ["AP"],
  FORLICESENA: ["FO"],
  LAQUILA: ["AQ"],
  MASSACARRARA: ["MS"],
  MB: ["MI"],
  MONZAEBRIANZA: ["MI"],
  OGLIASTRA: ["NU"],
  OG: ["NU"],
  OLBIATEMPIO: ["SS", "NU"],
  OT: ["SS", "NU"],
  PESAROEURBINO: ["PS"],
  PU: ["PS"],
  SUDSARDEGNA: ["CA", "OR", "NU"],
  VS: ["CA", "OR"],
};
