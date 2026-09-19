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
  return (
    numericRows.length >= 6 && (text.match(/\d[.,]\d{2}/g) || []).length >= 4
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
