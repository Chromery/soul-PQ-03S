import fs from "node:fs";
const catalog = JSON.parse(
  fs.readFileSync(
    "apps/api/src/price-lists/data/catalog.generated.json",
    "utf8",
  ),
);
const cell = (value) =>
  String(value ?? "—")
    .replaceAll("|", "/")
    .replaceAll("\n", " ");
const line = (values) => "| " + values.map(cell).join(" | ") + " |";
const status = {
  extracted: "Analizzato",
  partial: "Parziale",
  supporting: "Supporto",
  "no-prices": "Nessuna tariffa estratta",
};
const docs = catalog.documents;
const applicable = catalog.rules.filter(
  (r) => r.evidence === "exact" && r.semanticReview === "supported",
);
const rows = [
  "# Copertura del laboratorio prezzari",
  "",
  `Generato: ${catalog.generatedAt}. Catalogo: \`${catalog.version}\`. Modello: \`${catalog.model}\`. Prompt estrazione: \`${catalog.promptHash}\`; controllo semantico: \`${catalog.auditHash}\`.`,
  "",
  `Inventario: **${catalog.totals.files} file**, **${docs.length} fonti uniche**, **${catalog.totals.pages} pagine/blocchi**. Voci estratte: **${catalog.rules.length}**; riscontro letterale superato: **${catalog.totals.exactRules}**; quarantena: **${catalog.totals.reviewRules}**; seconda verifica superata: **${applicable.length}**; seconda verifica da completare: **${catalog.totals.semanticPending}**.`,
  "",
  "Le voci con verifica superata possono comunque richiedere altezza, comune, zona o altre condizioni prima di essere applicabili. Le fonti non sono tutte tariffari: vi sono note, esempi, calcolatori e copie identiche. “Analizzato” significa copertura delle pagine candidate, non certificazione di ogni cella. La consultazione della fonte e la conferma del tecnico restano obbligatorie.",
  "",
  "Le varianti complete sono scaricabili da **Prezzari → Scarica tutte le voci (CSV)**, dopo autenticazione in staging. Il CSV conserva anche unità non applicabili, voci escluse e motivi del controllo, senza trasformarle in tariffe al m².",
  "",
  "## Matrice per documento",
  "",
  line([
    "Territorio / file",
    "Pagine/blocchi",
    "OCR",
    "Candidate analizzate",
    "Voci",
    "Riscontro letterale",
    "Seconda verifica OK",
    "Da riconciliare",
    "Stato",
  ]),
  "|---|---:|---:|---:|---:|---:|---:|---:|---|",
  ...docs.map((d) =>
    line([
      `${d.territory} — ${d.file}`,
      d.pages,
      d.ocrPages,
      `${d.processedPages}/${d.candidatePages}`,
      d.rules,
      d.usableRules,
      applicable.filter((r) => r.documentId === d.id).length,
      d.reviewRules,
      status[d.status],
    ]),
  ),
  "",
  "## Duplicati identici",
  "",
  ...docs
    .filter((d) => d.aliases.length)
    .map(
      (d) =>
        `- \`${d.file}\`: ${d.aliases.map((a) => "`" + a + "`").join(", ")}. SHA-256: \`${d.sha256}\`.`,
    ),
  "",
  "## Distribuzione delle destinazioni",
  "",
  "Una voce può essere pertinente a più destinazioni: i conteggi di questa tabella non vanno sommati.",
  "",
  line(["Destinazione", "Voci associate", "Seconda verifica OK"]),
  "|---|---:|---:|",
  ...[...new Set(catalog.rules.flatMap((r) => r.usageIds))]
    .sort()
    .map((u) =>
      line([
        u,
        catalog.rules.filter((r) => r.usageIds.includes(u)).length,
        applicable.filter((r) => r.usageIds.includes(u)).length,
      ]),
    ),
  "",
  "## Pagine ancora incomplete",
  "",
  ...(docs.filter((d) => d.status === "partial").length
    ? docs
        .filter((d) => d.status === "partial")
        .map(
          (d) =>
            `- **${d.file}**: ${d.processedPages}/${d.candidatePages} pagine candidate complete; le voci recuperate sono conservate, ma non è dichiarata una copertura completa.`,
        )
    : [
        "Nessuna pagina candidata risulta incompleta nella pipeline corrente. Rimangono i limiti di OCR, individuazione automatica delle pagine e interpretazione tecnica descritti nel documento di analisi.",
      ]),
  "",
  "## Unità e valute originali",
  "",
  line(["Unità / valuta", "Voci"]),
  "|---|---:|",
  ...[...new Set(catalog.rules.map((r) => `${r.currency} / ${r.unit}`))]
    .sort()
    .map((key) =>
      line([
        key,
        catalog.rules.filter((r) => `${r.currency} / ${r.unit}` === key).length,
      ]),
    ),
  "",
  "Per architettura, casi Milano/Bergamo, criteri di esclusione, test e istruzioni di ripresa: [analisi-prezzari.md](analisi-prezzari.md).",
  "",
];
fs.writeFileSync("docs/analisi-prezzari-copertura.md", rows.join("\n"));
console.log(
  JSON.stringify({
    documents: docs.length,
    partial: docs.filter((d) => d.status === "partial").length,
    totals: catalog.totals,
  }),
);
