import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, ChevronRight, Layers3, RefreshCw, Sparkles, X } from "lucide-react";
import "./property-grouping-suggestions.css";

type Property = { id: string; address: string; humanReadableAddress?: string | null; comune: string; provincia?: string | null;
  foglio?: string | null; particella?: string | null; subalterno?: string | null; sezioneCatastale?: string | null;
  codiceComuneCatastale?: string | null; valuationGroupId?: string | null; categoria: string; currentRendita: number };
type Suggestion = { id: string; propertyIds: string[]; comune: string; provincia: string; sezione: string;
  foglio: string; matchValue: string; rejectedAt?: string };
type Suggestions = { pending: Suggestion[]; rejected: Suggestion[] };
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function PropertyGroupingSuggestions<T extends { id: string }>({ studyId, properties, onStudyUpdated, onNotice }: {
  studyId: string; properties: Property[]; onStudyUpdated: (study: T) => void; onNotice: (message: string) => void;
}) {
  const endpoint = `${import.meta.env.VITE_API_URL ?? "/api"}/studies/${encodeURIComponent(studyId)}/property-grouping-suggestions`;
  const [data, setData] = useState<Suggestions>({ pending: [], rejected: [] });
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [open, setOpen] = useState(false), [tab, setTab] = useState<"pending" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(busy); busyRef.current = busy;
  const trigger = useRef<HTMLButtonElement>(null), modal = useRef<HTMLElement>(null), serial = useRef(0);
  const refreshKey = JSON.stringify(properties.map(property => [property.id, property.valuationGroupId, property.comune, property.provincia,
    property.sezioneCatastale, property.codiceComuneCatastale, property.foglio, property.particella, property.subalterno]));
  const load = useCallback(async () => {
    const request = ++serial.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error("Impossibile caricare i suggerimenti. Riprova.");
      const result = await response.json() as Suggestions;
      if (!Array.isArray(result?.pending) || !Array.isArray(result?.rejected)) throw new Error("Impossibile caricare i suggerimenti. Riprova.");
      if (request === serial.current) setData(result);
    } catch (reason) {
      if (request === serial.current) setError(reason instanceof Error ? reason.message : "Errore di connessione.");
    } finally { if (request === serial.current) setLoading(false); }
  }, [endpoint]);
  useEffect(() => { void load(); return () => { serial.current++; }; }, [load, refreshKey]);
  useEffect(() => {
    const refresh = () => { if (!busy) void load(); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load, busy]);
  useEffect(() => {
    if (!open) return;
    const first = modal.current?.querySelector<HTMLButtonElement>("button"); first?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab") return;
      const focusable = [...(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? [])];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); trigger.current?.focus(); };
  }, [open]);

  async function review(suggestion: Suggestion, action: "accept" | "reject") {
    if (busy) return;
    ++serial.current; setBusy(suggestion.id); setError("");
    try {
      const response = await fetch(`${endpoint}/${suggestion.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!response.ok) {
        if (response.status === 409) {
          await load();
          throw new Error("Questo suggerimento è cambiato o è già stato gestito. La lista è stata aggiornata.");
        }
        throw new Error("Operazione non riuscita. Il suggerimento non è stato rimosso: riprova.");
      }
      const result = await response.json() as Suggestions & { study: T | null };
      setData({ pending: result.pending, rejected: result.rejected });
      if (action === "accept" && result.study?.id === studyId) onStudyUpdated(result.study);
      onNotice(action === "accept" ? "Gruppo immobili creato. Puoi aprirlo nell’editor per la valutazione complessiva." : "Suggerimento rifiutato. Resta disponibile nella sezione Rifiutati.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Errore di connessione."); }
    finally { setBusy(null); setLoading(false); }
  }

  const propertyById = new Map(properties.map(property => [property.id, property]));
  const count = data.pending.length;
  return <>
    <button ref={trigger} className={`button secondary compact-button suggestion-trigger ${count ? "has-pending" : ""}`} type="button"
      aria-haspopup="dialog" aria-label={`Gruppi suggeriti: ${count} da rivedere`} onClick={() => { setOpen(true); setTab("pending"); void load(); }}>
      <span className="suggestion-trigger-icon"><Layers3 size={18} />{count > 0 && <span className="suggestion-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}</span>
      Gruppi suggeriti{loading && <span className="sr-only"> · Caricamento</span>}{error && <span title="Caricamento da verificare">!</span>}
    </button>
    {open && createPortal(<div className="modal-backdrop suggestion-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
      <section ref={modal} className="suggestions-modal" role="dialog" aria-modal="true" aria-label="Gruppi suggeriti">
        <header className="suggestions-header">
          <div className="suggestions-heading-icon"><Sparkles size={24} /></div>
          <div><span className="suggestions-eyebrow">Valutazioni, insieme</span><h2>Gruppi suggeriti</h2><p>Stesso foglio e particella, subalterni diversi.<br />Scegli tu quali immobili valutare insieme.</p></div>
          <button type="button" className="suggestions-close" aria-label="Chiudi gruppi suggeriti" disabled={!!busy} onClick={() => setOpen(false)}><X size={20} /></button>
        </header>
        <div className="suggestions-navigation">
          <div role="group" aria-label="Stato dei suggerimenti">
            <button type="button" aria-pressed={tab === "pending"} onClick={() => setTab("pending")}>Da rivedere <span>{count}</span></button>
            <button type="button" aria-pressed={tab === "rejected"} onClick={() => setTab("rejected")}>Rifiutati <span>{data.rejected.length}</span></button>
          </div>
          <button className="icon-button" type="button" aria-label="Aggiorna suggerimenti" disabled={loading || !!busy} onClick={() => void load()}><RefreshCw size={16} /></button>
        </div>
        <div className="suggestions-body" aria-busy={loading || !!busy}>
          {error && <div className="suggestions-error" role="alert">{error}<button type="button" onClick={() => void load()} disabled={!!busy}>Riprova</button></div>}
          {loading && <p role="status">Verifica dei riferimenti catastali…</p>}
          {!loading && !error && data[tab].length === 0 && <div className="suggestions-empty">
            <span><CheckCheck size={30} /></span><h3>{tab === "pending" ? "Nessun gruppo da rivedere" : "Nessun suggerimento rifiutato"}</h3>
            <p>{tab === "pending" ? "Qui compariranno nuovi abbinamenti tra immobili non ancora raggruppati. I suggerimenti rifiutati non richiamano più la tua attenzione." : "Quando rifiuti un suggerimento lo conserviamo qui. Potrai sempre accettarlo in un secondo momento."}</p>
            {tab === "pending" && data.rejected.length > 0 && <button type="button" onClick={() => setTab("rejected")}>Rivedi i rifiutati <ChevronRight size={15} /></button>}
          </div>}
          {data[tab].map(suggestion => {
            const label = `Foglio ${suggestion.foglio} · Particella ${suggestion.matchValue}`;
            const members = suggestion.propertyIds.map(id => propertyById.get(id));
            return <article key={suggestion.id} className={`suggestion-card ${tab === "rejected" ? "is-rejected" : ""}`} aria-label={`${label} · ${suggestion.comune}`}>
              <div className="suggestion-card-heading"><div><h3>{label}</h3><p>{suggestion.comune}{suggestion.provincia ? ` (${suggestion.provincia})` : ""}{suggestion.sezione ? ` · Sezione ${suggestion.sezione}` : ""}</p></div>
                <div className="suggestion-review-actions">
                  <button type="button" className="suggestion-accept" disabled={!!busy || loading} onClick={() => void review(suggestion, "accept")} aria-label={`Accetta ${label}`} title="Accetta e raggruppa"><Check size={20} /></button>
                  {tab === "pending" && <button type="button" className="suggestion-reject" disabled={!!busy || loading} onClick={() => void review(suggestion, "reject")} aria-label={`Rifiuta ${label}`} title="Rifiuta il suggerimento"><X size={20} /></button>}
                </div>
              </div>
              <div className="suggestion-card-meta"><span><Layers3 size={13} />{suggestion.propertyIds.length} immobili</span>
                {members.every(Boolean) && <span>Rendita attuale {euro.format(members.reduce((sum, property) => sum + (property?.currentRendita ?? 0), 0))}</span>}
                {suggestion.rejectedAt && <span>Rifiutato il {new Date(suggestion.rejectedAt).toLocaleDateString("it-IT")}</span>}
              </div>
              <div className="suggestion-property-list" tabIndex={0} aria-label={`Immobili ${label}`}>
                <table><thead><tr><th>Immobile</th><th>Sub</th><th>Cat.</th><th>Rendita attuale</th></tr></thead>
                  <tbody>{suggestion.propertyIds.map((id, index) => { const property = members[index]; return <tr key={id}><td>{property?.humanReadableAddress || property?.address || id}</td><td>{property?.subalterno || "—"}</td><td>{property?.categoria || "—"}</td><td>{property ? euro.format(property.currentRendita) : "—"}</td></tr>; })}</tbody>
                </table>
              </div>
            </article>;
          })}
        </div>
        <footer className="suggestions-footer">Il raggruppamento viene creato solo dopo la tua conferma. Nessuna stima viene ricalcolata automaticamente.</footer>
      </section>
    </div>, document.body)}
  </>;
}
