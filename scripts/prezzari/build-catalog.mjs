import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  candidatePage,
  hash,
  auditRule,
  auditContext,
  completeBatch,
  heightScenario,
  includesLandInConditions,
  matchingMunicipalities,
  workedExamplePage,
  nonBuildingVolume,
  comoTerritorialCells,
  fvgLandRows,
} from "./lib.mjs";
const cache = process.env.PRICE_CACHE_DIR || ".cache/prezzari";
const promptHash = process.env.PRICE_PROMPT_HASH || "1d514faae90a";
const inventory = JSON.parse(
  fs.readFileSync(path.join(cache, "inventory.json")),
);
const batchDir = path.join(cache, "rules-" + promptHash);
const batches = fs
  .readdirSync(batchDir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => {
    try {
      return [
        {
          ...JSON.parse(fs.readFileSync(path.join(batchDir, f))),
          _file: f,
          _family: f.replace(/(?:-part\d+)+\.json$/, ".json"),
        },
      ];
    } catch {
      return [];
    } // A running extractor may still be completing a legacy non-atomic write.
  });
const batchIndex = new Map(batches.map((b) => [b._file, b]));
const compact = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
const normalize = (s) =>
  compact(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const canonicalProvince = (code) => ({ PS: "PU", FO: "FC" })[code] || code;
const usages = new Set([
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
]);
const provinces = JSON.parse(
  fs.readFileSync(
    "apps/api/src/formaps-territories/formaps-territories.generated.json",
  ),
).provinces;
const catalogRows = fs
  .readFileSync("docs/prezzari-territoriali-catalog.md", "utf8")
  .split("\n")
  .filter((l) => l.startsWith("| "))
  .map((l) => l.split("|").map((s) => s.trim()));
const originals = new Map(),
  rawById = new Map(),
  documents = [],
  rules = [],
  fingerprints = new Set();
// Never join whitespace-separated table columns into a single number.
const numberTokens = (text) =>
  [...String(text).matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => {
    const token = m[0];
    return Number(
      token.includes(",")
        ? token.replace(/\./g, "").replace(",", ".")
        : /^\d{1,3}(?:\.\d{3})+$/.test(token)
          ? token.replace(/\./g, "")
          : token,
    );
  });
for (const source of inventory) {
  if (originals.has(source.sha256)) {
    originals.get(source.sha256).aliases.push(source.file);
    continue;
  }
  const raw = JSON.parse(
    fs.readFileSync(path.join(cache, source.sha256 + ".json")),
  );
  rawById.set(source.sha256, raw);
  const metaCandidates = catalogRows.filter(
    (r) => r[4] === path.basename(source.file),
  );
  const meta =
    metaCandidates.length === 1
      ? metaCandidates[0]
      : metaCandidates.find(
          (r) => normalize(r[1]) === normalize(source.file.split("/")[0]),
        );
  const territory =
    meta?.[1] ||
    (source.file.startsWith("1_12_22_FVG_GO")
      ? "Gorizia"
      : source.file.startsWith("Ascoli Piceno/")
        ? "Ascoli Piceno"
        : "Da verificare");
  const province = canonicalProvince(
    provinces.find(
      (p) =>
        normalize(p.text) === normalize(territory) ||
        (territory === "Pesaro e Urbino" && p.id === "PU") ||
        (territory === "Massa-Carrara" && p.id === "MS"),
    )?.id || (territory === "Bolzano" ? "BZ" : null),
  );
  const valid = batches.filter(
    (b) =>
      b.sha256 === source.sha256 &&
      !b.split &&
      b.contentHash ===
        createHash("sha256")
          .update(JSON.stringify(b.targetPages.map((n) => raw.pages[n - 1])))
          .digest("hex"),
  );
  const pageFamily = new Map();
  for (const batch of valid.sort((a, b) =>
    (a.extractedAt || "").localeCompare(b.extractedAt || ""),
  ))
    for (const n of batch.targetPages) pageFamily.set(n, batch._family);
  let selected = valid.filter((b) =>
    b.targetPages.some((n) => pageFamily.get(n) === b._family),
  );
  let analyzed = new Set(
    selected.flatMap((b) => {
      const parent = batches.find((p) => p._file === b._family && p.split);
      if (parent && !completeBatch(parent, batchIndex)) return [];
      return b.targetPages.filter((n) => pageFamily.get(n) === b._family);
    }),
  );
  if (source.file === "Como/AGEDP-CO_145334_2025_1466_All3.xlsx") {
    for (const page of raw.pages)
      pageFamily.set(page.page, "structured-static-cells");
    selected = raw.pages.map((page) => ({
      _family: "structured-static-cells",
      targetPages: [page.page],
      rules: comoTerritorialCells(page.text).map((rule) => ({
        ...rule,
        page: page.page,
      })),
      notes: [
        "Tabella statica estratta cella per cella, senza eseguire formule. Valuta, unità e intestazioni incomplete restano da verificare.",
      ],
      priceEpoch: "Da verificare con le note metodologiche All4",
      includesCharges: null,
    }));
    analyzed = new Set(raw.pages.map((page) => page.page));
  }
  if (
    source.file.endsWith("Prontuario FVG Categorie D-E_2024-Appendice A.pdf")
  ) {
    for (const page of raw.pages)
      pageFamily.set(page.page, "structured-fvg-land");
    selected = raw.pages
      .filter((page) => page.page >= 3)
      .map((page) => ({
        _family: "structured-fvg-land",
        targetPages: [page.page],
        rules: fvgLandRows(page.text).map((rule) => ({
          ...rule,
          page: page.page,
        })),
        notes: [
          "Tabella min/max estratta deterministicamente per le cinque zone, con unità e biennio esplicitati a pagina PDF 3. Le voci passano comunque il secondo controllo semantico.",
        ],
        priceEpoch: "1988-1989",
        includesCharges: null,
      }));
    analyzed = new Set(
      raw.pages.filter(candidatePage).map((page) => page.page),
    );
  }
  const notes = [
    ...new Set(
      selected
        .flatMap((b) => (Array.isArray(b.notes) ? b.notes : []))
        .filter((n) => typeof n === "string"),
    ),
  ];
  const charges = selected
    .map((b) => b.includesCharges)
    .filter((v) => typeof v === "boolean");
  const epoch =
    [
      ...new Set(
        selected
          .map((b) => b.priceEpoch)
          .filter((v) => typeof v === "string" && v.trim()),
      ),
    ]
      .join(" / ")
      .slice(0, 400) || "Da verificare nella fonte";
  const role =
    /docfa esempio|relazioni di calcolo|nota trasmissione|doc_data|fototeca|link seminario|PREZZI FABBRICATI D BG/i.test(
      source.file,
    )
      ? "context"
      : source.file === "Como/AGEDP-CO_145334_2025_1466_All3.xlsx"
        ? "supplement"
        : /\.xlsx$/i.test(source.file)
          ? "calculator"
          : /allegato|appendice|valori.*aree|zone dei comuni/i.test(source.file)
            ? "supplement"
            : "price-list";
  const document = {
    id: source.sha256,
    sha256: source.sha256,
    file: source.file,
    aliases: [],
    format: source.format || "pdf",
    title: path.basename(source.file),
    territory,
    province,
    region: meta?.[3] || (province === "GO" ? "Friuli Venezia Giulia" : ""),
    year: Number(meta?.[5]) || null,
    epoch,
    includesCharges:
      charges.length && charges.every((v) => v === charges[0])
        ? charges[0]
        : null,
    historical: /vecchio/i.test(source.file),
    role,
    pages: raw.pages.length,
    processedPages: analyzed.size,
    candidatePages: raw.pages.filter(candidatePage).length,
    ocrPages: raw.pages.filter((p) => p.method === "ocr").length,
    rules: 0,
    usableRules: 0,
    reviewRules: 0,
    status: "no-prices",
    notes,
  };
  if (source.file === "Milano.pdf") {
    document.year = 2017;
    document.epoch = "1988-1989";
    document.includesCharges = true;
  }
  if (source.file === "Lecco.pdf") {
    document.year = 2015;
    document.includesCharges = false;
    document.notes.push(
      "Pagina 2: soli costi di costruzione; terreno, spese tecniche, oneri e profitto da aggiungere. Pagina 6: formule di interpolazione sulla superficie e maggiorazioni di altezza distinte per copertura.",
    );
  }
  if (
    source.file.endsWith(
      "Prontuario FVG Categorie D-E_2024-vers1.2-dicem2025.pdf",
    )
  ) {
    document.preferredForRegion = true;
    document.notes.push(
      "Pagine 3 e 6: riferimento regionale unificato successivo ai quattro prontuari provinciali del 2019; valori ordinari esplicitamente dichiarati, non medie inventate dal sistema.",
    );
  }
  if (
    source.file.endsWith("Prontuario FVG Categorie D-E_2024-Appendice A.pdf")
  ) {
    document.preferredForRegion = true;
    document.notes.push(
      "Appendice territoriale del riferimento regionale unificato 2025; pagina 3: valori in €/m² riferiti al biennio 1988-1989 e all’intero lotto.",
    );
  }
  if (source.file === "Bari.pdf") {
    document.includesLand = true;
    document.notes.push(
      "Pagina 12: valori delle costruzioni già comprensivi del suolo; area esterna pertinenziale valutata a parte. Non sommare automaticamente un secondo valore del lotto.",
    );
  }
  if (source.file.startsWith("CAMPOBASSO AGE.")) {
    document.includesLand = true;
    document.notes.push(
      "Pagina 19: valori delle costruzioni già comprensivi dell’area di sedime; area esterna pertinenziale separata. Applicazione diretta disabilitata per evitare di conteggiare due volte il lotto.",
    );
  }
  if (source.file === "PREZZI FABBRICATI D BG.pdf")
    document.notes.push(
      "La nota non contiene prezzi: invita al confronto con province limitrofe. Non viene trasformata in una tariffa.",
    );
  if (source.file === "Bergamo/preziario bergamo.pdf")
    document.notes.push(
      "Pagina 49: costo più frequente per deposito < 1.000 m², h 6–7 m, piano T. I correttivi di pagina 50 non sono applicati implicitamente. Oneri inclusi nelle voci successive a pagina 48.",
    );
  if (/Napoli Acen/i.test(source.file)) {
    document.notes.push(
      "Costi edilizi contemporanei: non equiparare ai valori catastali 1988-89 senza un percorso di riconduzione documentato.",
    );
    document.role = "context";
  }
  originals.set(source.sha256, document);
  documents.push(document);
  for (const batch of selected)
    for (const extracted of batch.rules) {
      const r = extracted,
        page = raw.pages[Number(r.page) - 1];
      if (pageFamily.get(Number(r.page)) !== batch._family) continue;
      if (
        !page ||
        !Number.isFinite(r.valueMin) ||
        r.valueMin < 0 ||
        r.valueMin > 1e10 ||
        typeof r.label !== "string"
      )
        continue;
      const review = [];
      const quote = compact(r.quote).slice(0, 2500);
      if (!quote || !compact(page.text).includes(quote))
        review.push("Estratto non coincidente con il testo sorgente");
      const tokens = numberTokens(quote);
      if (!tokens.some((n) => Math.abs(n - r.valueMin) < 0.001))
        review.push("Prezzo minimo da riconciliare con la fonte");
      const max = Number.isFinite(r.valueMax) ? r.valueMax : null;
      if (
        max !== null &&
        (!tokens.some((n) => Math.abs(n - max) < 0.001) || max < r.valueMin)
      )
        review.push("Intervallo da riconciliare con la fonte");
      if (!batch.targetPages.includes(Number(r.page)))
        review.push("Voce proveniente da una pagina di contesto");
      if (/Valori\s+Unitari\s+Centrali\s+OMI/i.test(page.text))
        review.push(
          "Valore OMI di confronto per il metodo di surrogazione, non costo di costruzione direttamente applicabile all’area dell’editor.",
        );
      const unit = ["m2", "m3", "m", "each", "percent", "other"].includes(
        r.unit,
      )
        ? r.unit
        : "other";
      const currency = ["EUR", "ITL"].includes(r.currency)
        ? r.currency
        : "unknown";
      if (currency === "unknown") review.push("Valuta non identificata");
      let kind = [
        "building",
        "land",
        "equipment",
        "adjustment",
        "other",
      ].includes(r.kind)
        ? r.kind
        : "other";
      if (
        ["land", "building", "other"].includes(kind) &&
        source.file !== "Bari.pdf" &&
        /pavimentaz|sistemazion|piazzal|recinzion|percorsi pedonali|vialett/i.test(
          r.label,
        ) &&
        !/valore (?:del |dell.)?(?:terreno|lotto)|area edificabile|costo (?:del )?(?:terreno|lotto)/i.test(
          r.label,
        )
      )
        kind = "site-work";
      if (
        kind === "land" &&
        /camp[oi] (?:da |di )?(?:gioco|calc|rugby|bocce|golf)|pista|tennis|calcio|solarium|impianto sportivo|piazzola|aree verdi/i.test(
          r.label,
        ) &&
        !/terren|suolo|lotto|area edificabile/i.test(r.label)
      )
        kind = "site-work";
      let usageIds = Array.isArray(r.usageIds)
        ? r.usageIds.filter((u) => usages.has(u))
        : ["custom"];
      if (!usageIds.length) usageIds = ["custom"];
      // Destination is not the enclosing structure: offices IN a warehouse remain offices.
      if (
        /^(?:uffic|costruzion[ei] per uffici|locali (?:ad uso |per )?uffici)/i.test(
          r.label,
        ) &&
        usageIds.includes("uffici")
      )
        usageIds = usageIds.filter((u) => u !== "capannone");
      // Match the priced object, not every component mentioned in its description.
      const destination = normalize(r.label);
      if (
        /^(?:fabbricat[oi] )?(?:capannone|capannoni|opificio|opifici|deposito|depositi)\b/.test(
          destination,
        ) &&
        !/area (?:amministrazione|uffici)/.test(destination)
      )
        usageIds = usageIds.filter((u) => u !== "uffici");
      if (
        /^(?:servizi|spogliatoi|archivi|mense)\b/.test(destination) ||
        /area spogliatoi/.test(destination)
      )
        usageIds = ["custom"];
      if (!usageIds.length) usageIds = ["custom"];
      if (
        /^(?:centro commerciale|centri commerciali|ipermercat|supermercat|grandi magazzin|galleri[ae] commercial)/.test(
          destination,
        )
      )
        usageIds = ["commerciale"];
      if (
        /^(?:camere di sicurezza|caveau|cinema|teatr|discotec|palestr|impianti sportiv|piscin|camp[oi] da golf)/.test(
          destination,
        )
      )
        usageIds = ["custom"];
      if (
        ["building", "site-work"].includes(kind) &&
        /agricol|zootecn|allevamento|stalla|stalle|fienil|camp[oi] da golf|campegg|roulotte|camper|campo da gioco|campi da gioco|tennis|\bcalcio\b|\bcalcetto\b|rugby|bocce|solarium|pista di pattinaggio/.test(
          destination,
        )
      )
        usageIds = ["custom"];
      if (kind === "site-work" && usageIds.every((u) => u === "lotto"))
        usageIds = ["sistemazione-esterna"];
      if (kind === "land") usageIds = ["lotto"];
      if (
        kind === "building" &&
        /valor[ei]\s+(?:di\s+)?mercato/i.test(
          `${page.text} ${r.label} ${r.qualifiers || ""}`,
        )
      )
        review.push(
          "La pagina usa valori di mercato: verificare l’approccio estimativo, non applicare direttamente come costo di costruzione.",
        );
      const qualifiers = compact(r.qualifiers).slice(0, 3500);
      if (
        /Como\/AGEDP-CO_145334_2025_1466_All[13]\.(?:pdf|xlsx)$/.test(
          source.file,
        )
      )
        review.push(
          "Tabella territoriale di Como: destinazione/colonna e unità da riconciliare con All4 pagina 3 (superficie lotto per produttivo, volume edificato per terziario). Non presumere €/m² per ogni colonna.",
        );
      if (workedExamplePage(page.text))
        review.push(
          "Pagina di esempio o modello di stima compilato: non tariffa autonoma.",
        );
      if (unit === "m3" && nonBuildingVolume(r.label))
        review.push(
          "Volume di un’opera o componente, non volume dell’edificio: non convertire con l’altezza dell’area.",
        );
      if (
        /esempio|simulazione|ipotesi di stima/i.test(`${r.label} ${qualifiers}`)
      )
        review.push(
          "Esempio o simulazione: verificare che sia una tariffa autonoma",
        );
      if (
        currency === "EUR" &&
        ["m2", "m3"].includes(unit) &&
        r.valueMin > 10000
      )
        review.push(
          "Valore unitario anomalo: verificare valuta, denominatore e separatori",
        );
      if (source.file === "Bologna/PRONTUARIO_BO.pdf" && Number(r.page) === 16)
        review.push("Esempio di calcolo, non prezzo autonomo");
      if (
        source.file === "Bergamo/preziario bergamo.pdf" &&
        [47, 72, 77, 83].includes(Number(r.page))
      )
        review.push("Esempio di calcolo: non tariffa autonoma");
      const key = [
        source.sha256,
        r.page,
        r.code,
        normalize(r.label),
        unit,
        r.valueMin,
        max,
      ].join("|");
      if (fingerprints.has(key)) continue;
      fingerprints.add(key);
      let municipality, municipalities;
      if (
        kind === "land" ||
        /\bcomun[ei]\b/i.test(`${r.label} ${qualifiers}`)
      ) {
        const regional = {
          Piemonte: ["AL", "AT", "BI", "CN", "NO", "TO", "VB", "VC"],
          Veneto: ["BL", "PD", "RO", "TV", "VE", "VI", "VR"],
          "Friuli Venezia Giulia": ["GO", "PN", "TS", "UD"],
        };
        const scope = province ? [province] : regional[document.region] || [];
        const names = provinces
          .filter((p) => scope.includes(canonicalProvince(p.id)))
          .flatMap((p) => p.comuni || [])
          .map((c) => ({
            ...c,
            text: c.text.replace(/\/\s*sez\.\s*[A-Z0-9_]+\s*$/i, ""),
          }))
          .filter((c) => !c.text.includes("/"))
          .sort((a, b) => b.text.length - a.text.length);
        const labelMatches = matchingMunicipalities(
          r.label,
          names.map((c) => c.text),
        );
        if (labelMatches.length === 1) municipality = labelMatches[0];
        else if (labelMatches.length > 1) municipalities = labelMatches;
        if (
          !municipality &&
          !municipalities &&
          !/altri comuni|restanti comuni|diversi da|esclus[oi]|eccetto|tranne|ad eccezione/i.test(
            `${r.label} ${qualifiers}`,
          )
        ) {
          const explicit = names.filter((c) =>
            (" " + normalize(qualifiers) + " ").includes(
              " comune di " + normalize(c.text) + " ",
            ),
          );
          if (explicit.length === 1) municipality = explicit[0].text;
        }
      }
      const rule = {
        id: createHash("sha256").update(key).digest("hex").slice(0, 24),
        documentId: source.sha256,
        page: Number(r.page),
        pageLabel: page.label,
        code: compact(r.code),
        label: compact(r.label).slice(0, 900),
        usageIds,
        kind,
        currency,
        unit,
        valueMin: r.valueMin,
        valueMax: max,
        qualifiers,
        quote,
        volumeKind: ["building", "capacity"].includes(r.volumeKind)
          ? r.volumeKind
          : "none",
        ordinary: r.ordinary === true,
        evidence: review.length ? "review" : "exact",
        reviewReasons: review,
        method: page.method,
        municipality,
        municipalities,
        includesLand:
          kind === "building" && includesLandInConditions(qualifiers),
      };
      rule.formulaDependent =
        /\b(?:cs|cu|costo(?: unitario)?)\s*=|\d\s*\+\s*\d\s*[*×]\s*\(/i.test(
          `${rule.quote} ${rule.qualifiers}`,
        );
      if (
        document.preferredForRegion &&
        rule.page === 16 &&
        rule.kind === "building" &&
        rule.unit === "m2" &&
        /^(Capannone|Magazzino) superficie coperta/.test(rule.label)
      ) {
        const threshold = rule.label.startsWith("Capannone") ? 2000 : 1000;
        const above = /superficie coperta >/.test(rule.label);
        rule.areaBounds = above
          ? { minExclusive: threshold }
          : { maxInclusive: threshold };
        rule.heightAdjustment = {
          base: 5,
          percentPerMetre: 5,
          note: "FVG, pagina PDF 16: +5% per ogni metro oltre H piano 5 m. Valore ordinario; lo scostamento per finiture, struttura o impianti non viene applicato automaticamente.",
        };
      }
      if (
        source.file === "Lecco.pdf" &&
        rule.page === 6 &&
        rule.kind === "building" &&
        rule.unit === "m2"
      ) {
        const flat = /copertura piana/i.test(rule.label),
          pitched = /doppia pendenza/i.test(rule.label);
        const band = /fino a 500 mq/i.test(rule.label)
          ? 0
          : /501 e 1600/i.test(rule.label)
            ? 1
            : /1601 e 5000/i.test(rule.label)
              ? 2
              : /maggiore di 5000/i.test(rule.label)
                ? 3
                : -1;
        const values = flat ? [206, 166, 149, 149] : [201, 155, 132, 132];
        if ((flat || pitched) && band >= 0 && rule.valueMin === values[band])
          rule.calculation = {
            type: "lecco-capannone",
            base: values[band],
            areaMin: [0, 501, 1601, 5000][band],
            areaMinExclusive: band === 3,
            areaMax: [500, 1600, 5000, null][band],
            coefficient:
              band === 1 ? (flat ? 40 : 46) : band === 2 ? (flat ? 17 : 23) : 0,
            denominator: band === 1 ? 1100 : band === 2 ? 3400 : 1,
            referenceHeight: 4,
            heightIncreasePercent: (flat
              ? [3.5, 2.7, 1.6, 1.6]
              : [3.4, 2.6, 2.1, 2.1])[band],
          };
      }
      if (
        source.file === "Bergamo/preziario bergamo.pdf" &&
        rule.page === 49 &&
        rule.kind === "building"
      ) {
        const zoneByPrice = {
          270: "A",
          250: "B",
          240: "C",
          220: "D",
          210: "E",
        };
        rule.zone = zoneByPrice[rule.valueMin];
        rule.includesCharges = true;
        rule.ordinary = true;
        rule.usageIds = ["capannone"];
        rule.qualifiers +=
          " Scenario di riferimento della fonte: deposito <1.000 m², altezza 6–7 m, piano terra. Correttivi di superficie, altezza, piano e destinazione da pagina 50 non inclusi automaticamente.";
      }
      if (
        source.file === "Bergamo/preziario bergamo.pdf" &&
        rule.page === 49 &&
        rule.kind === "land"
      )
        rule.zone = /zona\s+([ABCDE])/i.exec(rule.label)?.[1].toUpperCase();
      if (
        source.file === "Bergamo/preziario bergamo.pdf" &&
        rule.page === 49 &&
        rule.valueMin === 35 &&
        rule.unit === "m2"
      ) {
        rule.kind = "site-work";
        rule.includesCharges = true;
      }
      if (rule.unit === "m3" && rule.volumeKind === "building") {
        const scenario = heightScenario(rule.qualifiers);
        if (scenario) rule.referenceScenario = { ...scenario, page: rule.page };
      }
      if (
        source.file === "Milano.pdf" &&
        rule.code === "3.1.1" &&
        rule.unit === "m3" &&
        rule.kind === "building"
      )
        rule.referenceScenario = {
          height: 3.15,
          description:
            "Altezza virtuale 3–3,3 m nella fonte (pagina 8): scenario al punto medio, 3,15 m. Non è un’altezza rilevata né una frequenza statistica.",
          page: 8,
        };
      if (
        ["land", "building", "site-work"].includes(rule.kind) &&
        !rule.municipality &&
        !rule.municipalities?.length &&
        !rule.zone &&
        /\bcomun[ei]\b|zona OMI|localit/i.test(
          `${rule.label} ${rule.qualifiers}`,
        ) &&
        !/tutti i comuni|intera provincia/i.test(
          `${rule.label} ${rule.qualifiers}`,
        )
      ) {
        rule.evidence = "review";
        rule.reviewReasons.push(
          "Condizione territoriale non risolta in modo univoco: verificare comune/località prima di usare il prezzo.",
        );
      }
      rules.push(rule);
      document.rules++;
      if (review.length) document.reviewRules++;
      else document.usableRules++;
    }
  document.status = ["context", "calculator"].includes(document.role)
    ? "supporting"
    : document.processedPages < document.candidatePages
      ? "partial"
      : document.rules
        ? "extracted"
        : "no-prices";
}
const zoneSource = inventory.find(
  (s) => s.file === "Bergamo/zone dei comuni.pdf",
);
const bergamoZones = {};
if (zoneSource)
  for (const page of JSON.parse(
    fs.readFileSync(path.join(cache, zoneSource.sha256 + ".json")),
  ).pages)
    for (const line of page.text.split("\n")) {
      const match = line
        .trim()
        .match(/^([A-ZÀÈÉÌÒÙ'’ .-]+?)\s*(BERG|[ABCDE])$/);
      if (match && match[1].trim().length > 3)
        bergamoZones[normalize(match[1])] =
          match[2] === "BERG" ? "A" : match[2];
    }
const auditHash = "7601effc8eb8",
  auditDir = path.join(cache, "audit-" + auditHash);
const rulesById = new Map(rules.map((r) => [r.id, r]));
const docsById = new Map(documents.map((d) => [d.id, d]));
for (const r of rules)
  r.semanticReview =
    r.evidence === "exact" &&
    ["building", "land", "site-work"].includes(r.kind) &&
    ["m2", "m3"].includes(r.unit) &&
    !["context", "calculator"].includes(docsById.get(r.documentId).role)
      ? "pending"
      : "not-required";
if (fs.existsSync(auditDir)) {
  const audits = fs
    .readdirSync(auditDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(auditDir, f))))
    .sort((a, b) => a.auditedAt.localeCompare(b.auditedAt));
  for (const audit of audits) {
    const batch = Object.keys(audit.ruleSignatures).map((id) =>
      rulesById.get(id),
    );
    const present = batch.filter(Boolean);
    if (!present.length) continue;
    const context = auditContext(
      rawById.get(present[0].documentId),
      audit.page,
    );
    if (audit.contextHash) {
      if (hash(context) !== audit.contextHash) continue;
    } else if (
      batch.some((r) => !r) ||
      hash({ batch: batch.map(auditRule), context }) !== audit.contentHash
    )
      continue;
    for (const check of audit.checks) {
      const r = rulesById.get(check.id);
      if (!r || r.semanticReview === "not-required") continue;
      if (hash(auditRule(r)) !== audit.ruleSignatures[check.id]) continue;
      r.semanticReview = check.verdict;
      if (check.verdict === "review") {
        r.evidence = "review";
        r.reviewReasons.push(
          ...(check.issues.length
            ? check.issues
            : ["Associazione voce/prezzo non confermata"]
          ).map((reason) => "Controllo semantico: " + reason),
        );
      }
    }
  }
}
for (const d of documents) {
  const own = rules.filter((r) => r.documentId === d.id);
  d.usableRules = own.filter((r) => r.evidence === "exact").length;
  d.reviewRules = own.length - d.usableRules;
  d.auditedRules = own.filter((r) =>
    ["supported", "review"].includes(r.semanticReview),
  ).length;
}
const result = {
  version:
    "2026-09-19.1+" +
    hash({ promptHash, auditHash, documents, rules, bergamoZones }).slice(
      0,
      12,
    ),
  generatedAt: new Date().toISOString(),
  model: "deepseek-v4-flash",
  promptHash,
  documents,
  rules,
  bergamoZones,
  auditHash,
  totals: {
    files: inventory.length,
    documents: documents.length,
    pages: documents.reduce((s, d) => s + d.pages, 0),
    rules: rules.length,
    exactRules: rules.filter((r) => r.evidence === "exact").length,
    reviewRules: rules.filter((r) => r.evidence !== "exact").length,
    semanticSupported: rules.filter((r) => r.semanticReview === "supported")
      .length,
    semanticPending: rules.filter((r) => r.semanticReview === "pending").length,
  },
};
fs.mkdirSync("apps/api/src/price-lists/data", { recursive: true });
function writeAtomic(file, content) {
  fs.writeFileSync(file + ".tmp", content);
  fs.renameSync(file + ".tmp", file);
}
writeAtomic(
  "apps/api/src/price-lists/data/catalog.generated.json",
  JSON.stringify(result),
);
writeAtomic(
  path.join(cache, "coverage.json"),
  JSON.stringify(documents, null, 2),
);
console.log(JSON.stringify(result.totals));
