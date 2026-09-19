import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { PriceCatalog, PriceQuery } from "./price-rules.types.js";
import { normalizePriceText, suggestPriceRules } from "./price-rules.engine.js";
import { resolveFormapsTerritory } from "../formaps-territories/formaps-territory-resolver.js";

export function priceCsvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}

@Injectable()
export class PriceRulesService {
  private readonly catalog: PriceCatalog;
  private readonly provinces: Array<{ id: string; text: string }>;
  constructor() {
    const file = fileURLToPath(
      new URL("./data/catalog.generated.json", import.meta.url),
    );
    this.catalog = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : {
          version: "unavailable",
          generatedAt: "",
          model: "",
          promptHash: "",
          documents: [],
          rules: [],
          bergamoZones: {},
          totals: {
            files: 0,
            documents: 0,
            pages: 0,
            rules: 0,
            exactRules: 0,
            reviewRules: 0,
          },
        };
    this.provinces = JSON.parse(
      readFileSync(
        new URL(
          "../formaps-territories/formaps-territories.generated.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).provinces.map(({ id, text }: { id: string; text: string }) => ({
      id,
      text,
    }));
    for (const [id, text] of [
      ["BZ", "Bolzano"],
      ["TN", "Trento"],
    ])
      if (!this.provinces.some((p) => p.id === id))
        this.provinces.push({ id, text });
  }
  summary() {
    return {
      version: this.catalog.version,
      generatedAt: this.catalog.generatedAt,
      totals: this.catalog.totals,
      provinces: this.provinces,
      documents: this.catalog.documents.map(
        ({ file, sha256, notes, ...doc }) => ({
          ...doc,
          sha256,
          notes: notes.slice(0, 8),
        }),
      ),
    };
  }
  suggestions(query: PriceQuery) {
    return suggestPriceRules(this.catalog, query);
  }
  exportCsv() {
    const documents = new Map(this.catalog.documents.map((d) => [d.id, d]));
    const rows: unknown[][] = [
      [
        "Documento",
        "SHA256",
        "Territorio",
        "Provincia",
        "Epoca economica",
        "Pagina",
        "Voce",
        "Descrizione",
        "Tipologie area",
        "Tipo costo",
        "Valuta originale",
        "Unita originale",
        "Minimo",
        "Massimo",
        "Condizioni",
        "Estratto fonte",
        "Esito riscontro",
        "Seconda verifica",
        "Scenario ordinario indicato dalla fonte",
        "Scenario altezza proposto",
        "Valore dipendente da formula",
        "Regola di calcolo supportata",
        "Motivi revisione",
      ],
    ];
    for (const r of this.catalog.rules) {
      const d = documents.get(r.documentId)!;
      rows.push([
        d.title,
        d.id,
        d.territory,
        d.province,
        d.epoch,
        r.page,
        r.code,
        r.label,
        r.usageIds.join(" | "),
        r.kind,
        r.currency,
        r.unit,
        r.valueMin,
        r.valueMax,
        r.qualifiers,
        r.quote,
        r.evidence,
        r.semanticReview,
        r.ordinary ? "si" : "no",
        r.referenceScenario
          ? `${r.referenceScenario.height} m - ${r.referenceScenario.description} (pag. ${r.referenceScenario.page})`
          : "",
        r.formulaDependent ? "si" : "no",
        r.calculation ? JSON.stringify(r.calculation) : "",
        r.reviewReasons.join(" | "),
      ]);
    }
    return (
      "\uFEFF" + rows.map((row) => row.map(priceCsvCell).join(";")).join("\r\n")
    );
  }
  context(province: string, municipality: string) {
    const normalizedMunicipality = municipality
      .replace(/\s*\([A-Z]{2}\)\s*$/i, "")
      .trim();
    const knownProvince = this.provinces.find(
      (p) =>
        normalizePriceText(p.id) === normalizePriceText(province) ||
        normalizePriceText(p.text) === normalizePriceText(province),
    );
    const resolved = resolveFormapsTerritory(
      knownProvince?.id,
      normalizedMunicipality,
    );
    const safe =
      resolved.selected && ["exact", "normalized"].includes(resolved.strategy)
        ? resolved.selected
        : null;
    // Fuzzy matches are never silently adopted for a financial reference.
    return {
      province: safe?.provinceId || knownProvince?.id || null,
      municipality: safe?.municipality || normalizedMunicipality,
      strategy: safe
        ? resolved.strategy
        : knownProvince
          ? "province-only"
          : "unresolved",
    };
  }
  async source(id: string) {
    const doc = this.catalog.documents.find((d) => d.id === id);
    if (!doc)
      throw new NotFoundException("Documento non presente nel catalogo");
    const configuredRoot = process.env.PRICE_RULE_SOURCE_DIR;
    if (!configuredRoot)
      throw new ServiceUnavailableException("Archivio sorgenti non collegato");
    let root: string, file: string;
    try {
      root = await realpath(configuredRoot);
      file = await realpath(path.resolve(root, doc.file));
    } catch {
      throw new NotFoundException("Sorgente originale non disponibile");
    }
    if (!file.startsWith(root + path.sep))
      throw new NotFoundException("Sorgente non valida");
    const data = await readFile(file);
    if (createHash("sha256").update(data).digest("hex") !== doc.sha256)
      throw new ServiceUnavailableException(
        "Il documento è cambiato: ripetere l’estrazione prima di usarlo",
      );
    return {
      data,
      name: path.basename(doc.file),
      mime:
        doc.format === "pdf"
          ? "application/pdf"
          : doc.format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/plain; charset=utf-8",
    };
  }
}
