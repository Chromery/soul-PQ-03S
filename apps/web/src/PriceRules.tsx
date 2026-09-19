import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSearch,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import "./price-rules.css";

const usages = [
  ["capannone", "Capannone"],
  ["uffici", "Uffici"],
  ["tettoie", "Tettoie"],
  ["sistemazione-esterna", "Sistemazione esterna"],
  ["verde", "Verde"],
  ["lotto", "Terreno / lotto"],
  ["interrato", "Interrato"],
  ["parcheggio-interrato", "Parcheggio interrato"],
  ["parcheggio-esterno", "Parcheggio esterno"],
  ["negozio", "Negozio"],
  ["commerciale", "Commerciale"],
  ["laboratorio", "Laboratorio"],
  ["casa-di-cura", "Casa di cura"],
  ["hotel", "Hotel"],
  ["locali-tecnici", "Locali tecnici"],
  ["parcheggio-multipiano", "Parcheggio multipiano"],
  ["custom", "Altre tipologie"],
];
const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const money = (n: number) => `${number.format(n)} €`;
const unitLabel: Record<string, string> = {
  m2: "m²",
  m3: "m³",
  m: "m lineare",
  each: "unità",
  percent: "%",
  other: "unità da verificare",
};
type Document = {
  id: string;
  title: string;
  territory: string;
  province: string | null;
  region: string;
  year: number | null;
  epoch: string;
  historical: boolean;
  role: string;
  pages: number;
  processedPages: number;
  candidatePages: number;
  ocrPages: number;
  rules: number;
  usableRules: number;
  reviewRules: number;
  status: string;
  aliases: string[];
  notes: string[];
  format: string;
};
type Catalog = {
  version: string;
  generatedAt: string;
  provinces: Array<{ id: string; text: string }>;
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
  documents: Document[];
};
type Rule = {
  id: string;
  documentId: string;
  page: number;
  pageLabel?: string;
  code: string;
  label: string;
  unit: string;
  currency: string;
  valueMin: number;
  valueMax: number | null;
  qualifiers: string;
  quote: string;
  kind: string;
  method: string;
  evidence: string;
  ordinary?: boolean;
  formulaDependent?: boolean;
  reviewReasons: string[];
  reasons: string[];
  referenceScenario?: { height: number; description: string; page: number };
  document: Pick<
    Document,
    "id" | "title" | "territory" | "year" | "epoch" | "historical" | "role"
  >;
  proposal: {
    applicable: boolean;
    includesCharges: boolean | null;
    min: number | null;
    max: number | null;
    suggested: number | null;
    formula: string;
    assumptions: string[];
    missingInputs: string[];
    requiresHeight: boolean;
  };
};
type Results = {
  items: Rule[];
  total: number;
  message: string | null;
  zone: string | null;
  catalogVersion: string;
};
export type PriceProvenance = {
  ruleId: string;
  documentId: string;
  page: number;
  label: string;
  catalogVersion: string;
  rate: number;
  formula: string;
  assumptions: string[];
  height?: number;
  sourceEpoch?: string;
  selectionContext?: {
    province: string;
    municipality: string;
    usage: string;
    zone?: string;
    span?: number;
    area?: number;
    manualDocument: boolean;
  };
  confirmedAt: string;
};
export type PriceApplication = {
  rate: number;
  removeCharges: boolean;
  clearAmountOverride: boolean;
  provenance: PriceProvenance;
};
type BrowserProps = {
  locationNotice?: string;
  province?: string;
  municipality?: string;
  usage?: string;
  area?: number;
  currentRate?: number;
  hasCharges?: boolean;
  hasAmountOverride?: boolean;
  onApply?: (value: PriceApplication) => void;
};

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, credentials: "same-origin" });
  if (response.status === 400)
    throw new Error(
      "Controlla i filtri: altezza e luce devono essere maggiori di zero e non superiori a 200 m; la superficie deve essere un numero positivo.",
    );
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Sessione scaduta. Accedi nuovamente per consultare i prezzari."
        : "Impossibile caricare il catalogo. Riprova tra poco.",
    );
  return response.json();
}
async function openSource(
  doc: { id: string; title: string },
  page: number,
  onError: (message: string) => void,
) {
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  try {
    const response = await fetch(
      `/api/price-rules/documents/${doc.id}/source`,
      { credentials: "same-origin" },
    );
    if (!response.ok)
      throw Error(
        response.status === 401
          ? "Accedi nuovamente per aprire il documento."
          : "Sorgente non disponibile o modificata. Non usare la voce senza verifica.",
      );
    const url = URL.createObjectURL(await response.blob());
    if (tab) tab.location.href = `${url}#page=${page}`;
    else {
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.title;
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 300000);
  } catch (error) {
    tab?.close();
    onError((error as Error).message);
  }
}

export function PriceRuleBrowser(props: BrowserProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [catalogError, setCatalogError] = useState("");
  const [province, setProvince] = useState(
      /^[A-Z]{2}$/i.test(props.province || "")
        ? props.province!.toUpperCase()
        : "",
    ),
    [municipality, setMunicipality] = useState(
      (props.municipality || "").replace(/\s*\([A-Z]{2}\)\s*$/, ""),
    );
  const [usage, setUsage] = useState(props.usage || "capannone"),
    [search, setSearch] = useState(""),
    [documentId, setDocumentId] = useState("");
  const [height, setHeight] = useState(""),
    [span, setSpan] = useState(""),
    [area, setArea] = useState(""),
    [zone, setZone] = useState("");
  const [scenario, setScenario] = useState("");
  useEffect(() => {
    if (scenario) {
      setScenario("");
      setHeight("");
    }
  }, [province, usage, documentId]);
  const [historical, setHistorical] = useState(false),
    [review, setReview] = useState(false),
    [offset, setOffset] = useState(0);
  const [results, setResults] = useState<Results | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<Rule | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [removeCharges, setRemoveCharges] = useState(false),
    [clearOverride, setClearOverride] = useState(false),
    [retry, setRetry] = useState(0);
  const confirmationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) confirmationRef.current?.focus();
  }, [selected]);
  const queryKey = JSON.stringify({
    province,
    municipality,
    usage,
    search,
    documentId,
    height,
    span,
    area,
    zone,
    historical,
    review,
  });
  const locationTouched = useRef(false);
  useEffect(() => {
    if (!props.province && !props.municipality) return;
    const c = new AbortController();
    const params = new URLSearchParams({
      province: props.province || "",
      municipality: props.municipality || "",
    });
    readJson<{ province: string | null; municipality: string }>(
      `/api/price-rules/context?${params}`,
      c.signal,
    )
      .then((context) => {
        if (!locationTouched.current) {
          setProvince(context.province || "");
          setMunicipality(context.municipality);
        }
      })
      .catch(() => {});
    return () => c.abort();
  }, [props.province, props.municipality]);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError("");
    readJson<Catalog>("/api/price-rules/catalog", controller.signal)
      .then(setCatalog)
      .catch((e) => {
        if (e.name !== "AbortError") setCatalogError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    setOffset(0);
    setSelected(null);
    setConfirmed(false);
    setRemoveCharges(false);
    setClearOverride(false);
  }, [queryKey]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelected(null);
    setConfirmed(false);
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        limit: "12",
        offset: String(offset),
      });
      for (const [key, value] of Object.entries({
        province,
        municipality,
        usage,
        search,
        documentId,
        height: height.replace(",", "."),
        span: span.replace(",", "."),
        area: area.replace(",", "."),
        zone,
        historical,
        review,
      }))
        if (value !== "" && value !== false) params.set(key, String(value));
      readJson<Results>(
        `/api/price-rules/suggestions?${params}`,
        controller.signal,
      )
        .then(setResults)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [queryKey, offset, retry]);
  const provinces = (catalog?.provinces || [])
    .map((p) => [p.id, p.text])
    .sort((a, b) => a[1].localeCompare(b[1]));
  const selectedDocument = catalog?.documents.find((d) => d.id === documentId);
  const chargesConflict =
    selected?.proposal.includesCharges === true && props.hasCharges;
  const canApply = Boolean(
    selected?.proposal.applicable &&
      selected.proposal.suggested !== null &&
      confirmed &&
      (!chargesConflict || removeCharges) &&
      (!props.hasAmountOverride || clearOverride) &&
      !loading &&
      !error,
  );
  const apply = () => {
    if (
      !selected ||
      !canApply ||
      selected.proposal.suggested === null ||
      !results
    )
      return;
    props.onApply?.({
      rate: selected.proposal.suggested,
      removeCharges: Boolean(chargesConflict && removeCharges),
      clearAmountOverride: clearOverride,
      provenance: {
        ruleId: selected.id,
        documentId: selected.documentId,
        page: selected.page,
        label: selected.label,
        catalogVersion: results.catalogVersion,
        rate: selected.proposal.suggested,
        formula: selected.proposal.formula,
        assumptions: [
          ...selected.proposal.assumptions,
          selected.qualifiers,
          ...(scenario ? [scenario] : []),
        ],
        height: height ? Number(height.replace(",", ".")) : undefined,
        sourceEpoch: selected.document.epoch,
        selectionContext: {
          province,
          municipality,
          usage,
          zone: results.zone || undefined,
          span: span ? Number(span.replace(",", ".")) : undefined,
          area: area ? Number(area.replace(",", ".")) : undefined,
          manualDocument: Boolean(documentId),
        },
        confirmedAt: new Date().toISOString(),
      },
    });
  };
  return (
    <div className="price-browser">
      <div className="price-explainer">
        <ShieldCheck size={21} />
        <div>
          <strong>
            Un riferimento da scegliere, non una stima automatica.
          </strong>
          <p>
            Le proposte rispettano territorio e tipologia. Controlla variante,
            epoca economica, unità e oneri nella fonte: le altre caratteristiche
            dell’immobile non sono presunte.
          </p>
        </div>
      </div>
      {props.locationNotice && (
        <p className="price-warning" role="status">
          {props.locationNotice}
        </p>
      )}
      <div className="price-filters">
        <label>
          Provincia
          <select
            aria-label="Provincia"
            value={province}
            onChange={(e) => {
              locationTouched.current = true;
              setProvince(e.target.value);
              setMunicipality("");
              setDocumentId("");
              setZone("");
            }}
          >
            <option value="">Seleziona provincia</option>
            {province && !provinces.some(([id]) => id === province) && (
              <option>{province}</option>
            )}
            {provinces.map(([id, name]) => (
              <option key={id} value={id}>
                {name} ({id})
              </option>
            ))}
          </select>
        </label>
        <label>
          Comune
          <input
            aria-label="Comune"
            value={municipality}
            onChange={(e) => {
              locationTouched.current = true;
              setMunicipality(e.target.value);
            }}
            placeholder="Comune dell’immobile"
            maxLength={150}
          />
        </label>
        <label>
          Tipologia area
          <select
            aria-label="Tipologia area"
            value={usage}
            onChange={(e) => setUsage(e.target.value)}
          >
            <option value="">Tutte le tipologie</option>
            {usages.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="price-filter-search">
          Cerca una variante
          <div>
            <Search size={16} />
            <input
              aria-label="Cerca una variante"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Es. finiture, prefabbricato, deposito…"
              maxLength={180}
            />
          </div>
        </label>
      </div>
      <details className="price-advanced">
        <summary>
          Caratteristiche e fonti <ChevronDown size={15} />
        </summary>
        <div className="price-filters">
          <label>
            Altezza equivalente (m)
            <input
              aria-label="Altezza equivalente (m)"
              type="number"
              min="0.1"
              max="200"
              step="0.01"
              value={height}
              onChange={(e) => {
                setHeight(e.target.value);
                setScenario("");
              }}
              placeholder="Non nota"
            />
            <small>Per €/m³: volume / superficie di riferimento.</small>
          </label>
          <label>
            Luce strutturale (m)
            <input
              aria-label="Luce strutturale (m)"
              type="number"
              min="0.1"
              max="200"
              step="0.1"
              value={span}
              onChange={(e) => setSpan(e.target.value)}
              placeholder="Non nota"
            />
            <small>Filtra le varianti dei capannoni di Milano.</small>
          </label>
          <label>
            Superficie di riferimento edificio (m²)
            <input
              aria-label="Superficie di riferimento edificio (m²)"
              type="number"
              min="0.01"
              max="100000000"
              step="0.01"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Non nota"
            />
            <small>
              Formule di Lecco e fasce FVG: non è automaticamente l’area
              disegnata.
            </small>
          </label>
          <label>
            Zona di Bergamo
            <select
              aria-label="Zona di Bergamo"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              disabled={
                province !== "BG" && selectedDocument?.province !== "BG"
              }
            >
              <option value="">Dal comune, se disponibile</option>
              {["A", "B", "C", "D", "E"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <small>
              {results?.zone
                ? `Zona individuata: ${results.zone}`
                : "Nessuna zona presunta"}
            </small>
          </label>
          <label>
            Documento specifico
            <select
              aria-label="Documento specifico"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
            >
              <option value="">Fonti del territorio selezionato</option>
              {catalog?.documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.territory} · {d.title}
                </option>
              ))}
            </select>
            <small>La scelta manuale sostituisce il filtro territoriale.</small>
          </label>
        </div>
        <p className="price-filter-note">
          I dati aggiuntivi entrano nei calcoli e nei filtri soltanto quando la
          regola è già strutturata. Le altre condizioni restano da verificare
          nella fonte.
        </p>
        <div className="price-checks">
          <label>
            <input
              type="checkbox"
              checked={historical}
              onChange={(e) => setHistorical(e.target.checked)}
            />{" "}
            Includi fonti marcate “vecchio”
          </label>
          <label>
            <input
              type="checkbox"
              checked={review}
              onChange={(e) => setReview(e.target.checked)}
            />{" "}
            Mostra anche voci da riconciliare (non applicabili)
          </label>
        </div>
      </details>
      {selectedDocument && (
        <div className="price-document-info">
          <BookOpen size={18} />
          <div>
            <strong>{selectedDocument.title}</strong>
            <p>
              {selectedDocument.processedPages}/
              {selectedDocument.candidatePages} pagine candidate analizzate ·{" "}
              {selectedDocument.rules} voci · epoca: {selectedDocument.epoch}
            </p>
            {selectedDocument.notes.slice(0, 3).map((note, i) => (
              <p key={i}>{note}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void openSource(selectedDocument, 1, setError)}
          >
            Apri fonte <ExternalLink size={14} />
          </button>
        </div>
      )}
      {(error || catalogError) && (
        <div className="price-error" role="alert">
          {error || catalogError}
          <button
            type="button"
            onClick={() => {
              setCatalogError("");
              setRetry((v) => v + 1);
            }}
          >
            Riprova
          </button>
        </div>
      )}
      {scenario && (
        <p className="price-explainer">
          Scenario attivo: {scenario}{" "}
          <button
            type="button"
            onClick={() => {
              setScenario("");
              setHeight("");
            }}
          >
            Rimuovi scenario
          </button>
        </p>
      )}
      <div className="price-results-heading">
        <span>
          {loading
            ? "Ricerca nel catalogo…"
            : `${results?.total || 0} varianti compatibili`}
        </span>
        <small>Ordine per pertinenza, non per probabilità statistica</small>
      </div>
      <div
        className={`price-results ${loading ? "is-loading" : ""}`}
        aria-busy={loading}
      >
        {!loading && !results?.items.length && !error && (
          <div className="price-empty">
            <FileSearch size={38} />
            <h3>
              {province || documentId
                ? "Nessuna voce con questi filtri"
                : "Partiamo dal territorio"}
            </h3>
            <p>{results?.message}</p>
          </div>
        )}
        {results?.items.map((rule, index) => (
          <article
            key={rule.id}
            className={`price-card ${selected?.id === rule.id ? "is-selected" : ""} ${rule.evidence !== "exact" ? "needs-review" : ""}`}
          >
            <div className="price-card-content">
              <div className="price-card-tags">
                <span>
                  <MapPin size={12} />
                  {rule.document.territory}
                </span>
                {rule.code && <span>Voce {rule.code}</span>}
                {rule.ordinary && <span>Variante ordinaria / media</span>}
                {rule.method === "ocr" && <span>OCR · verificare</span>}
                {rule.evidence !== "exact" && (
                  <span className="price-warning">Da riconciliare</span>
                )}
                {index === 0 && offset === 0 && rule.proposal.applicable && (
                  <span className="price-match">Prima corrispondenza</span>
                )}
              </div>
              <h3>{rule.label}</h3>
              <p className="price-conditions">
                {rule.qualifiers ||
                  "Condizioni da verificare sul documento originale."}
              </p>
              <div className="price-card-source">
                <span>
                  {rule.document.title} ·{" "}
                  {rule.pageLabel || `pag. ${rule.page}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void openSource(rule.document, rule.page, setError)
                  }
                >
                  Fonte <ExternalLink size={13} />
                </button>
              </div>
              <details className="price-evidence">
                <summary>Perché questa voce · testo originale</summary>
                <ul>
                  {rule.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
                <p>Epoca economica: {rule.document.epoch}</p>
                <blockquote>{rule.quote}</blockquote>
                {rule.reviewReasons.map((reason, i) => (
                  <p className="price-warning" key={i}>
                    {reason}
                  </p>
                ))}
              </details>
            </div>
            <div className="price-card-value">
              <small>
                {rule.formulaDependent
                  ? "Valore base nella formula, non prezzo finale"
                  : "Prezzo nella fonte"}
              </small>
              <strong>
                {number.format(rule.valueMin)}
                {rule.valueMax !== null && rule.valueMax !== rule.valueMin
                  ? ` – ${number.format(rule.valueMax)}`
                  : ""}{" "}
                {rule.unit === "percent"
                  ? "%"
                  : rule.currency === "EUR"
                    ? "€"
                    : rule.currency === "ITL"
                      ? "₤"
                      : "?"}
                {rule.unit !== "percent" && (
                  <span> / {unitLabel[rule.unit]}</span>
                )}
              </strong>
              {rule.proposal.suggested !== null && rule.proposal.applicable ? (
                <>
                  <small>
                    {rule.proposal.min !== rule.proposal.max
                      ? "Scenario: punto medio dell’intervallo"
                      : "Proposta da verificare"}
                  </small>
                  <b>
                    {money(rule.proposal.suggested)}
                    <span> / m²</span>
                  </b>
                </>
              ) : (
                <p className="price-unavailable">
                  {rule.proposal.missingInputs.join(". ") ||
                    "Voce consultabile, non applicabile direttamente al m²."}
                </p>
              )}
              <button
                type="button"
                className="price-select"
                disabled={loading || !rule.proposal.applicable}
                onClick={() => {
                  setSelected(rule);
                  setConfirmed(false);
                  setRemoveCharges(false);
                  setClearOverride(false);
                }}
              >
                {selected?.id === rule.id ? (
                  <>
                    <Check size={15} /> Scelta
                  </>
                ) : props.onApply ? (
                  "Valuta questa proposta"
                ) : (
                  "Esamina proposta"
                )}
              </button>
              {rule.proposal.requiresHeight && !height && (
                <small>
                  Apri “Caratteristiche e fonti” e indica l’altezza.
                </small>
              )}
              {rule.referenceScenario && !height && (
                <button
                  type="button"
                  title={rule.referenceScenario.description}
                  onClick={() => {
                    setHeight(String(rule.referenceScenario!.height));
                    setScenario(rule.referenceScenario!.description);
                  }}
                >
                  Prova scenario h{" "}
                  {number.format(rule.referenceScenario.height)} m
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {(results?.total || 0) > 12 && (
        <div className="price-pagination">
          <button
            type="button"
            disabled={loading || offset === 0}
            onClick={() => setOffset((v) => Math.max(0, v - 12))}
          >
            <ChevronLeft size={17} /> Precedenti
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 12, results!.total)} di{" "}
            {results!.total}
          </span>
          <button
            type="button"
            disabled={loading || offset + 12 >= results!.total}
            onClick={() => setOffset((v) => v + 12)}
          >
            Successive <ChevronRight size={17} />
          </button>
        </div>
      )}
      {selected && (
        <section
          ref={confirmationRef}
          tabIndex={-1}
          className="price-confirmation"
          aria-label="Conferma proposta"
        >
          <div>
            <Sparkles size={22} />
            <h3>{selected.label}</h3>
            <strong>{money(selected.proposal.suggested!)} / m²</strong>
            <button
              type="button"
              aria-label="Chiudi proposta"
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="price-formula">{selected.proposal.formula}</p>
          <ul>
            {selected.proposal.assumptions.map((assumption, i) => (
              <li key={i}>{assumption}</li>
            ))}
          </ul>
          {props.onApply && (
            <>
              <p>
                Prezzo attuale dell’area:{" "}
                <strong>{money(props.currentRate || 0)} / m²</strong>.
                Nessun’altra area viene modificata.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />{" "}
                Ho verificato unità, condizioni, epoca economica e oneri nella
                fonte.
              </label>
              {chargesConflict && (
                <label className="price-warning">
                  <input
                    type="checkbox"
                    checked={removeCharges}
                    onChange={(e) => setRemoveCharges(e.target.checked)}
                  />{" "}
                  Rimuovi gli oneri aggiuntivi dall’area: sono già compresi in
                  questa voce.
                </label>
              )}
              {props.hasAmountOverride && (
                <label className="price-warning">
                  <input
                    type="checkbox"
                    checked={clearOverride}
                    onChange={(e) => setClearOverride(e.target.checked)}
                  />{" "}
                  Rimuovi il totale manuale dell’area per ricalcolarlo con
                  questo prezzo.
                </label>
              )}
              <button
                type="button"
                className="price-apply"
                disabled={!canApply}
                onClick={apply}
              >
                <Check size={17} /> Applica soltanto a questa area
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export function PriceRuleLab() {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const download = async () => {
    setExporting(true);
    try {
      const r = await fetch("/api/price-rules/export.csv", {
        credentials: "same-origin",
      });
      if (!r.ok)
        throw Error(
          "Esportazione non disponibile. Verifica la sessione e riprova.",
        );
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = "pq-prezzari-revisione.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    const c = new AbortController();
    readJson<Catalog>("/api/price-rules/catalog", c.signal)
      .then(setCatalog)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, []);
  return (
    <main className="price-lab">
      <header className="price-lab-hero">
        <div>
          <span className="price-lab-eyebrow">
            <Sparkles size={15} /> Laboratorio · analisi-prezzari
          </span>
          <h1>Il prezzo giusto parte dalla fonte.</h1>
          <p>
            Esplora i prezzari catastali, confronta le varianti e scegli con
            consapevolezza. Suggerimenti territoriali, con la decisione sempre
            al tecnico.
          </p>
        </div>
        <BookOpen size={76} />
      </header>
      {catalog && (
        <div className="price-stats">
          <div>
            <strong>{catalog.totals.files}</strong>
            <span>file inventariati</span>
          </div>
          <div>
            <strong>{catalog.totals.documents}</strong>
            <span>fonti uniche</span>
          </div>
          <div>
            <strong>{number.format(catalog.totals.rules)}</strong>
            <span>varianti estratte</span>
          </div>
          <div>
            <strong>
              {number.format(catalog.totals.semanticSupported || 0)}
            </strong>
            <span>con secondo riscontro superato</span>
          </div>
        </div>
      )}
      <div className="price-lab-actions">
        <span>
          Estrazione una tantum · consulta, confronta, verifica
          {catalog &&
            ` · ${number.format(catalog.totals.reviewRules)} voci escluse${catalog.totals.semanticPending ? ` · ${number.format(catalog.totals.semanticPending)} in verifica` : ""}`}
        </span>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void download()}
        >
          <Download size={16} />
          {exporting ? "Esportazione…" : "Scarica tutte le voci (CSV)"}
        </button>
      </div>
      {error && (
        <p className="price-error" role="alert">
          {error}
        </p>
      )}
      <PriceRuleBrowser />
      <details className="price-coverage">
        <summary>
          <BookOpen size={18} /> Copertura e limiti dell’archivio{" "}
          <ChevronDown size={16} />
        </summary>
        <p>
          “Testo riscontrato” verifica la presenza di estratto e cifre nella
          fonte, non certifica l’interpretazione tecnica. Pagine candidate
          individuate automaticamente; nessuna garanzia di completezza di ogni
          singola tabella. Duplicati identici sono accorpati. I fogli di calcolo
          e le note restano documenti di supporto. I costi al m²/m³ passano
          anche un secondo controllo automatico della relazione fra descrizione
          e prezzo: finché non lo superano, non sono applicabili nell’editor.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="price-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Territorio / documento</th>
                <th>Pagine analizzate / candidate</th>
                <th>Voci / testo riscontrato</th>
                <th>Stato</th>
                <th>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {catalog?.documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.territory}</strong>
                    <br />
                    {d.title}
                    {d.aliases.length > 0 && (
                      <small> + {d.aliases.length} copie identiche</small>
                    )}
                  </td>
                  <td>
                    {d.processedPages} / {d.candidatePages}
                    {d.ocrPages > 0 && <small>{d.ocrPages} pagine OCR</small>}
                  </td>
                  <td>
                    {d.rules} / {d.usableRules}
                  </td>
                  <td>
                    {
                      (
                        {
                          extracted: "Analizzato",
                          partial: "Parziale",
                          supporting: "Supporto",
                          "no-prices": "Nessun prezzo estratto",
                        } as Record<string, string>
                      )[d.status]
                    }
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Apri ${d.title}`}
                      onClick={() => void openSource(d, 1, setError)}
                    >
                      <ExternalLink size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  );
}

export function PriceRuleModal({
  onClose,
  ...props
}: BrowserProps & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="price-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
        if (e.key === "Tab") {
          const focusable = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex="0"]',
            ) || [],
          ).filter((el) => el.getClientRects().length > 0);
          const first = focusable[0],
            last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div
        ref={ref}
        className="price-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-modal-title"
      >
        <header>
          <div>
            <span className="price-lab-eyebrow">Laboratorio prezzari</span>
            <h2 id="price-modal-title">Scegli il prezzo dell’area</h2>
          </div>
          <button
            type="button"
            aria-label="Chiudi suggerimenti prezzi"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        <PriceRuleBrowser {...props} />
      </div>
    </div>,
    document.body,
  );
}
