import { createHash } from "node:crypto";
import path from "node:path";
export function completeBatch(batch, index, seen = new Set()) {
  if (!batch) return false;
  if (!batch.split) return true;
  if (!batch.children?.length || seen.has(batch._file)) return false;
  const next = new Set(seen);
  next.add(batch._file);
  return batch.children.every((child) => {
    const record = index.get(path.basename(child.file));
    return (
      record?.contentHash === child.contentHash &&
      completeBatch(record, index, next)
    );
  });
}
export const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export function workedExamplePage(text) {
  return (
    /^\s*(?:\d+[.)]?\s*)?esempi(?:o)?\s+(?:\d|applic|di\s+(?:calcol|stim)|numeric|pratic)/im.test(
      text,
    ) ||
    /accertamento della propriet[àa'’].{0,40}immobiliare|mod\.?\s*2NB\s*[-–]\s*parte/i.test(
      text,
    ) ||
    (/coeff\.?\s*(?:di\s*)?vetust/i.test(text) &&
      /costo in.{0,20}deprezzato|ragguagliati deprezzato/i.test(text))
  );
}

export function nonBuildingVolume(label) {
  return /^(?:diga|dighe|galleri[ae] (?:ed? |di )|opere di presa|pozzo piezometrico|pozzi piezometrici|condott[ae]|scav[oi]|mur[oi] di sostegno)\b/i.test(
    label.trim(),
  );
}

export function onlyPageFurniture(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (/[€£]|\beuro\b|\blire\b|m[²³23]|\bmq\b|\bmc\b/i.test(text)) return false;
  const heading =
    /^Categorie Speciali e Particolari\s*[-–]\s*Prontuario Regionale del Piemonte\s*[-–]\s*Appendice (?:Dicembre )?20\d{2}$/i;
  return (
    lines.some((line) => heading.test(line)) &&
    lines.every((line) => /^\d{1,4}$/.test(line) || heading.test(line))
  );
}

// Como All3 is a static table, not a calculator. Preserve each explicit cell;
// the truncated headings do not justify assigning currency/unit automatically.
export function comoTerritorialCells(text) {
  const rules = [];
  for (const line of text.split("\n")) {
    const cells = [...line.matchAll(/(?:^|\|)\s*([A-Z]+)(\d+):\s*([^|]*)/g)];
    const municipality = cells.find((c) => c[1] === "A")?.[3].trim();
    if (!municipality || /^(COMUNE|VALORI UNITARI)/i.test(municipality))
      continue;
    for (const cell of cells) {
      if (!/^[B-H]$/.test(cell[1])) continue;
      const value = cell[3].trim();
      const match = /^(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?$/.exec(
        value,
      );
      if (!match) continue;
      rules.push({
        code: cell[1] + cell[2],
        label: `Valore territoriale ${municipality} · colonna ${cell[1]}`,
        usageIds: ["lotto"],
        kind: "land",
        currency: "unknown",
        unit: "other",
        valueMin: Number(match[1].replace(",", ".")),
        valueMax: match[2] ? Number(match[2].replace(",", ".")) : null,
        qualifiers:
          "Tabella statica di Como: colonna e destinazione da verificare nell’originale. All4 pagina 3 distingue superficie del lotto e volume edificato; nessuna unità viene presunta. Cella " +
          cell[1] +
          cell[2] +
          ".",
        quote: cell[1] + cell[2] + ": " + value,
        volumeKind: "none",
        ordinary: false,
      });
    }
  }
  return rules;
}

export function fvgLandRows(text) {
  const zones = [
    "Zona a carattere rurale",
    "Periferica o a vocazione industriale",
    "Assi commerciali e grossa distribuzione",
    "Semicentrale e frazioni",
    "Centro urbano e zone di pregio",
  ];
  const rules = [];
  for (const line of text.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) continue;
    const values = parts.slice(-10);
    const municipality = parts.slice(0, -10).join(" ");
    if (
      !/[A-ZÀ-Ù]/.test(municipality) ||
      !values.every((value) => /^(?:\d+(?:[.,]\d+)?|-)$/.test(value))
    )
      continue;
    for (let i = 0; i < zones.length; i++) {
      if (values[i * 2] === "-" || values[i * 2 + 1] === "-") continue;
      const min = Number(values[i * 2].replace(",", "."));
      const max = Number(values[i * 2 + 1].replace(",", "."));
      if (max < min) continue;
      rules.push({
        code: `FVG-SUOLO-${i + 1}`,
        label: `Terreno - ${municipality} - ${zones[i]}`,
        usageIds: ["lotto"],
        kind: "land",
        currency: "EUR",
        unit: "m2",
        valueMin: min,
        valueMax: max,
        qualifiers: `Comune/località ${municipality}. ${zones[i]}. Valori indicativi in condizioni di ordinarietà, epoca 1988–1989; €/m² dell’intero lotto coperto e scoperto (Appendice A, pagina PDF 3). Verificare la zona urbana e l’eventuale zona censuaria indicata, non presunte dal comune. Opere esterne non comprese.`,
        quote: line.trim(),
        volumeKind: "none",
        ordinary: true,
      });
    }
  }
  return rules;
}

export function matchingMunicipalities(text, names) {
  const normalize = (value) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  if (
    /altri comuni|restanti comuni|diversi da|eccetto|tranne|ad eccezione/i.test(
      text,
    )
  )
    return [];
  let haystack = " " + normalize(text) + " ";
  const found = [];
  for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
    const token = " " + normalize(name) + " ";
    if (!haystack.includes(token)) continue;
    found.push(name);
    haystack = haystack.split(token).join(" ");
  }
  return found;
}
export function includesLandInConditions(text) {
  const normalized = text
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ");
  // Narrow positive statements only: “situato in area” or “non comprensivo” are not inclusions.
  return normalized.split(/[.;]/).some((part) => {
    if (
      /non (?:sono |è |e )?(?:comprensiv|inclus|compres)|esclus[oaie].*(?:terreno|suolo|area di sedime)/.test(
        part,
      )
    )
      return false;
    return /(?:comprensiv[oaie]|comprende|inclus[oaie]) (?:anche )?(?:(?:il|la|del|dell|di) )?(?:(?:valore|costo) )?(?:(?:del|dell|di) )?(?:suolo|terreno|area di sedime|area edificabile)\b|(?:area di sedime|terreno|suolo) (?:già |gia )?(?:inclus[oaie]|compres[oaie])\b/.test(
      part,
    );
  });
}
export function corruptedText(text) {
  const compact = text.replace(/\s/g, "");
  if (!compact.length) return false;
  return (
    (compact.match(/[\x00-\x08\x0e-\x1f\x7f\ufffd]/g) || []).length >
      compact.length * 0.01 ||
    (compact.match(/[\u0100-\u024f\u0370-\u03ff]/g) || []).length >
      compact.length * 0.06
  );
}
// A scenario is an explicit assumption, never a measured or statistically inferred height.
export function heightScenario(conditions) {
  const range =
    /(?:altezza(?:\s+(?:media|utile|virtuale|compresa))?|\bh\s*[=:]?)\s*(?:compresa\s*)?(?:tra\s*|da\s*)?(\d+(?:[.,]\d+)?)\s*(?:m(?:t|etri)?\.?\s*)?(?:[-–÷]|\ba\b|\be\b)\s*(\d+(?:[.,]\d+)?)\s*(?:metri|mt\.?|m)\b/i.exec(
      conditions,
    );
  if (!range) return null;
  const min = Number(range[1].replace(",", ".")),
    max = Number(range[2].replace(",", "."));
  if (min < 2 || max > 15 || max <= min) return null;
  return {
    height: Math.round((min + max) * 50) / 100,
    description: `Scenario al punto medio dell’intervallo di altezza ${min}–${max} m riportato nelle condizioni della voce. Non è un’altezza rilevata né una frequenza statistica: verificare che sia equivalente al volume/superficie della stima.`,
  };
}
export function candidatePage(page) {
  const text = page.text || "";
  if (text.trim().length < 30) return false;
  if (
    /[€£]|euro|lire|(?:\bmq\b|\bmc\b|m[²³23])[^\n]{0,60}\d|\d[^\n]{0,60}(?:\bmq\b|\bmc\b)/i.test(
      text,
    )
  )
    return true;
  // Continuation tables may omit currency and unit headings repeated on the preceding page.
  const numericRows = text
    .split("\n")
    .filter((line) => (line.match(/\d+(?:[.,]\d+)*/g) || []).length >= 2);
  const alignedRows = text
    .split("\n")
    .filter((line) => /(?:\s{2,}\d+(?:[.,]\d+)?){2,}\s*$/.test(line));
  return (
    alignedRows.length >= 6 ||
    (numericRows.length >= 6 &&
      ((text.match(/\d[.,]\d{2}/g) || []).length >= 4 ||
        (text.match(/\d+\s*[-–]\s*\d+/g) || []).length >= 4))
  );
}
export function auditRule({
  id,
  code,
  label,
  usageIds,
  kind,
  currency,
  unit,
  valueMin,
  valueMax,
  qualifiers,
  volumeKind,
}) {
  return {
    id,
    code,
    label,
    usageIds,
    kind,
    currency,
    unit,
    valueMin,
    valueMax,
    qualifiers,
    volumeKind,
  };
}
export function auditContext(source, page) {
  const surrounding = [page - 1, page + 1, 1, 2, 3]
    .filter(
      (p, i, a) =>
        p > 0 && p !== page && p <= source.pages.length && a.indexOf(p) === i,
    )
    .map((p) => `PAGINA ${p} CONTESTO\n${source.pages[p - 1].text}`)
    .join("\n")
    .slice(0, 25000);
  return `PAGINA ${page} TARGET\n${source.pages[page - 1].text}\n${surrounding}`;
}
