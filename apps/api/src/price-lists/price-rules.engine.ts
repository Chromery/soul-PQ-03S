import { regionForProvince } from "./price-lists.service.js";
import type {
  PriceCatalog,
  PriceDocument,
  PriceQuery,
  PriceRule,
} from "./price-rules.types.js";

export function normalizePriceText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function calculatePriceProposal(
  rule: PriceRule,
  document: PriceDocument,
  query: PriceQuery,
) {
  const assumptions: string[] = [],
    missingInputs: string[] = [];
  let factor = rule.currency === "ITL" ? 1 / 1936.27 : 1;
  let formula = `${rule.valueMin}${rule.valueMax !== null ? `–${rule.valueMax}` : ""} ${rule.currency}/${rule.unit}`;
  let calculatedBase: number | null = null;
  if (rule.currency === "ITL") {
    formula += " ÷ 1.936,27";
    assumptions.push(
      "Conversione fissa lire/euro; l’epoca economica non viene rivalutata.",
    );
  }
  const supported =
    rule.unit === "m2" ||
    (rule.unit === "m3" && rule.volumeKind === "building");
  if (rule.semanticReview !== "supported")
    missingInputs.push(
      rule.semanticReview === "review"
        ? "Seconda verifica automatica non superata: voce consultabile, non applicabile."
        : "Seconda verifica automatica ancora da completare: voce consultabile, non ancora applicabile.",
    );
  if (rule.formulaDependent && !rule.calculation)
    missingInputs.push(
      "La voce dipende da una formula non ancora automatizzata: il valore base non è il prezzo finale.",
    );
  if (rule.calculation) {
    const c = rule.calculation;
    calculatedBase = c.base;
    if (
      query.area !== undefined &&
      (query.area < c.areaMin ||
        (c.areaMinExclusive && query.area === c.areaMin) ||
        (c.areaMax !== null && query.area > c.areaMax))
    )
      missingInputs.push(
        "Superficie fuori dall’intervallo previsto dalla voce",
      );
    if (c.coefficient) {
      if (query.area === undefined)
        missingInputs.push(
          "Superficie di riferimento dell’edificio necessaria per calcolare questa formula",
        );
      else {
        calculatedBase +=
          (c.coefficient * (c.areaMax! - query.area)) / c.denominator;
        formula = `(${c.base} + ${c.coefficient} × (${c.areaMax} − ${query.area}) / ${c.denominator}) EUR/m2`;
      }
    }
    if (query.height === undefined)
      assumptions.push(
        "Lecco, pagina 6: scenario base h 4 m; altezza reale non ancora nota.",
      );
    else if (query.height < c.referenceHeight)
      missingInputs.push(
        "La fonte parte da h 4 m: non viene inventato un correttivo per altezze inferiori",
      );
    else if (query.height > c.referenceHeight) {
      const increase =
        ((query.height - c.referenceHeight) * c.heightIncreasePercent) / 100;
      factor *= 1 + increase;
      formula += ` × (1 + ${round(increase * 100)}%)`;
      assumptions.push(
        `Lecco, pagina 6: +${c.heightIncreasePercent}% per ogni metro oltre ${c.referenceHeight} m, secondo copertura e fascia di superficie.`,
      );
    }
    assumptions.push(
      "La superficie inserita è quella di riferimento del fabbricato nella tabella, non automaticamente quella dell’area disegnata.",
    );
  }
  if (rule.municipality && !query.municipality)
    missingInputs.push("Comune necessario per una voce territoriale specifica");
  if (rule.zone && !query.zone)
    missingInputs.push(
      "Zona necessaria: indica il comune o scegli la zona documentata",
    );
  if ((document.includesLand || rule.includesLand) && rule.kind === "building")
    missingInputs.push(
      "Prezzo comprensivo del suolo: verificare separatamente il modello di lotto dell’editor. Applicazione diretta disabilitata per evitare duplicazioni.",
    );
  if (rule.unit === "m3" && rule.volumeKind === "building") {
    if (query.height === undefined)
      missingInputs.push(
        "Altezza equivalente necessaria per convertire il volume in superficie",
      );
    else {
      factor *= query.height;
      formula += ` × ${query.height} m`;
      assumptions.push(
        "Altezza equivalente inserita dall’operatore: verificare il volume vuoto per pieno e i piani inclusi nella fonte.",
      );
    }
  }
  // Reviewed Milan 2017 §2.4/2.5: correction is separate from volumetric conversion.
  if (
    document.file === "Milano.pdf" &&
    ["2.4", "2.5"].includes(rule.code) &&
    rule.unit === "m2" &&
    rule.kind === "building"
  ) {
    if (query.height === undefined)
      assumptions.push(
        "Prezzo base per altezza fino a 5 m: altezza dell’immobile non ancora nota.",
      );
    else if (query.height > 5) {
      const increase = Math.min(0.1, (query.height - 5) * 0.05);
      factor *= 1 + increase;
      formula += ` × (1 + ${round(increase * 100)}%)`;
      assumptions.push(
        "Milano §2.4/2.5: +5% per metro oltre 5 m, massimo +10%. Copertura a shed e altri correttivi non applicati.",
      );
    }
  }
  if (rule.valueMax !== null && rule.valueMax !== rule.valueMin)
    assumptions.push(
      "La proposta è il punto medio dell’intervallo, non un prezzo statisticamente più frequente.",
    );
  if (
    /a partire da|\bda €|valore minimo/i.test(rule.qualifiers) &&
    rule.valueMax === null
  )
    assumptions.push(
      "La fonte indica un prezzo di partenza, non un massimo né una media.",
    );
  const includesCharges = rule.includesCharges ?? document.includesCharges;
  if (includesCharges === true)
    assumptions.push(
      "Oneri inclusi nella voce: evitare di aggiungerli nuovamente nell’editor.",
    );
  else if (includesCharges === null)
    assumptions.push(
      "Inclusione degli oneri da verificare nella fonte prima dell’applicazione.",
    );
  if (rule.method === "ocr")
    assumptions.push(
      "Fonte letta con OCR: verificare cifra e unità sulla pagina originale.",
    );
  if (rule.qualifiers)
    assumptions.push(
      "Altri correttivi, maggiorazioni o esclusioni descritti nella voce non sono applicati automaticamente, salvo quelli esplicitati nella formula.",
    );
  const applicable =
    supported &&
    rule.evidence === "exact" &&
    rule.currency !== "unknown" &&
    ["building", "land", "site-work"].includes(rule.kind) &&
    !["context", "calculator"].includes(document.role) &&
    !missingInputs.length;
  const min =
    supported && !missingInputs.length
      ? round((calculatedBase ?? rule.valueMin) * factor)
      : null;
  const max =
    supported && !missingInputs.length
      ? round((calculatedBase ?? rule.valueMax ?? rule.valueMin) * factor)
      : null;
  return {
    applicable,
    includesCharges,
    min,
    max,
    suggested: min === null || max === null ? null : round((min + max) / 2),
    formula,
    assumptions,
    missingInputs,
    requiresHeight: rule.unit === "m3" && rule.volumeKind === "building",
  };
}

export function suggestPriceRules(catalog: PriceCatalog, query: PriceQuery) {
  const documents = new Map(catalog.documents.map((d) => [d.id, d]));
  const province =
      (query.documentId ? documents.get(query.documentId)?.province : null) ||
      query.province?.toUpperCase(),
    region = regionForProvince(province);
  const search = normalizePriceText(query.search || "")
    .split(" ")
    .filter(Boolean);
  const municipality = normalizePriceText(
    (query.municipality || "").replace(/\s*\([A-Z]{2}\)\s*$/i, ""),
  );
  const zone =
    query.zone ||
    (province === "BG" ? catalog.bergamoZones[municipality] : undefined);
  const candidates = catalog.rules
    .flatMap((rule) => {
      const doc = documents.get(rule.documentId)!;
      if (query.documentId && query.documentId !== doc.id) return [];
      if (
        !query.documentId &&
        (!province ||
          !(
            doc.province === province ||
            (!doc.province && doc.region === region)
          ))
      )
        return [];
      if (
        (doc.historical && !query.historical) ||
        (rule.evidence !== "exact" && !query.review)
      )
        return [];
      if (!query.documentId && ["context", "calculator"].includes(doc.role))
        return [];
      if (query.usage && !rule.usageIds.includes(query.usage)) return [];
      if (query.usage === "lotto" && rule.kind !== "land") return [];
      if (query.usage && query.usage !== "lotto" && rule.kind === "land")
        return [];
      const content = normalizePriceText(
        `${rule.label} ${rule.code} ${rule.qualifiers}`,
      );
      if (!search.every((word) => content.includes(word))) return [];
      if (
        rule.municipality &&
        municipality &&
        normalizePriceText(rule.municipality) !== municipality
      )
        return [];
      if (rule.zone && zone && rule.zone !== zone) return [];
      if (
        rule.calculation &&
        query.area !== undefined &&
        (query.area < rule.calculation.areaMin ||
          (rule.calculation.areaMinExclusive &&
            query.area === rule.calculation.areaMin) ||
          (rule.calculation.areaMax !== null &&
            query.area > rule.calculation.areaMax))
      )
        return [];
      if (
        doc.file === "Milano.pdf" &&
        rule.code === "2.4" &&
        rule.kind === "building" &&
        query.span !== undefined
      ) {
        const expected =
          query.span <= 15
            ? 165
            : query.span <= 20
              ? 214
              : query.span <= 30
                ? 248
                : null;
        if (rule.valueMin !== expected) return [];
      }
      const reasons: string[] = [
        doc.province === province
          ? "Provincia corrispondente"
          : query.documentId
            ? "Documento scelto manualmente"
            : "Prezzario regionale",
      ];
      let score = doc.province === province ? 100 : 70;
      if (query.usage) {
        reasons.push("Destinazione compatibile; verificare la variante");
        score += 50;
      }
      if (rule.ordinary) {
        reasons.push("La fonte descrive una variante ordinaria o media");
        score += 8;
      }
      if (rule.municipality && municipality) {
        reasons.push("Comune corrispondente");
        score += 30;
      }
      if (rule.zone && zone) {
        reasons.push(
          `Zona ${zone}${query.zone ? " scelta" : " ricavata dall’allegato comuni di Bergamo"}`,
        );
        score += 20;
      }
      if (
        doc.file === "Milano.pdf" &&
        rule.code === "2.4" &&
        query.usage === "capannone"
      )
        score += 25;
      if (
        doc.file === "Bergamo/preziario bergamo.pdf" &&
        rule.page === 49 &&
        rule.kind === "building"
      ) {
        score += 25;
        reasons.push(
          "Scenario più frequente esplicitato nella fonte: deposito <1.000 m², h 6–7 m, piano T",
        );
      }
      score += doc.year ? Math.max(0, Math.min(12, (doc.year - 1990) / 3)) : 0;
      if (doc.year)
        reasons.push(
          `Edizione/documento ${doc.year}; epoca economica distinta da verificare`,
        );
      if (doc.historical) score -= 40;
      const proposal = calculatePriceProposal(rule, doc, { ...query, zone });
      if (rule.semanticReview === "pending") score -= 50;
      if (rule.evidence !== "exact") score -= 100;
      if (rule.kind === "adjustment" || rule.kind === "equipment") score -= 30;
      return [
        {
          ...rule,
          document: {
            id: doc.id,
            title: doc.title,
            territory: doc.territory,
            year: doc.year,
            epoch: doc.epoch,
            historical: doc.historical,
            role: doc.role,
          },
          reasons,
          score,
          proposal,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.document.title.localeCompare(b.document.title) ||
        a.page - b.page ||
        a.label.localeCompare(b.label),
    );
  const offset = query.offset || 0,
    limit = query.limit || 30;
  return {
    total: candidates.length,
    offset,
    limit,
    zone: zone || null,
    items: candidates.slice(offset, offset + limit),
    message:
      !province && !query.documentId
        ? "Indica la provincia o scegli un documento: nessuna località viene presunta."
        : candidates.length
          ? null
          : "Nessuna voce compatibile con i filtri. Consulta il documento originale: non viene proposta una tariffa di un altro territorio.",
    catalogVersion: catalog.version,
    experimental: true,
  };
}
