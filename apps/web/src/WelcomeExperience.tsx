import { useEffect, useRef } from "react";
import { ArrowRight, Building2, FileDown, Layers3, RefreshCw, X } from "lucide-react";
import "./welcomeExperience.css";

const features = [
  { icon: RefreshCw, title: "Dall’ERP alla tua scrivania", text: "Ritrova studi, immobili e documenti in un unico spazio." },
  { icon: Layers3, title: "Dalla planimetria alla valutazione", text: "Misura le aree e confronta rendita catastale e IMU." },
  { icon: FileDown, title: "Dall’analisi alla presentazione", text: "Prepara il PDF v3, annota le valutazioni e aggiorna l’esito dello studio." },
];

function PlanIllustration() {
  return <div className="pq-plan-art" aria-hidden="true">
    <div className="pq-plan-sheet">
      <div className="pq-plan-caption"><Building2 size={18} /><span>Il prossimo progetto</span><i /></div>
      <svg viewBox="0 0 280 148" fill="none">
        <path d="M22 20H258V128H22Z" stroke="currentColor" strokeWidth="3" />
        <path d="M110 20V72H22M110 103V128M168 20V128M168 79H258" stroke="currentColor" strokeWidth="3" />
        <path d="M28 26H104V66H28ZM174 26H252V73H174Z" fill="currentColor" opacity=".08" />
        <path d="M110 73A30 30 0 0 1 140 103H110M168 79A28 28 0 0 1 196 107V79" stroke="currentColor" opacity=".4" />
        <path d="M22 140H258M10 20V128" stroke="currentColor" strokeDasharray="3 4" opacity=".35" />
      </svg>
      <div className="pq-plan-lines"><i /><i /><i /></div>
    </div>
    <div className="pq-plan-stamp"><span /> Spazio pronto</div>
  </div>;
}

export function WelcomeModal({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return <dialog ref={dialog} className="pq-welcome" aria-labelledby="pq-welcome-title"
    aria-describedby="pq-welcome-description" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="pq-welcome-blue">
      <button className="pq-welcome-close" onClick={onClose} aria-label="Chiudi il benvenuto"><X size={20} /></button>
      <span className="pq-kicker">SOUL · PROSPECT QUALIFIER</span>
      <div className="pq-welcome-intro">
        <div><span className="pq-release-pill">Il tuo spazio di lavoro</span>
          <h1 id="pq-welcome-title">Benvenuto in PQ.<br />Diamo valore<br />a ogni immobile.</h1>
          <p id="pq-welcome-description">Tutto quello che serve per accompagnare uno studio, dal primo documento alla presentazione finale.</p>
        </div>
        <PlanIllustration />
      </div>
    </div>
    <div className="pq-welcome-content">
      <div className="pq-welcome-features">{features.map(({ icon: Icon, title, text }, index) =>
        <div className="pq-welcome-feature" key={title} style={{ animationDelay: `${100 + index * 90}ms` }}>
          <span className="pq-feature-icon"><Icon size={21} /></span><div><h2>{title}</h2><p>{text}</p></div>
        </div>)}</div>
      <div className="pq-welcome-footer"><p>Un flusso chiaro. Un posto per ogni dettaglio.</p>
        <button className="button primary" autoFocus onClick={onClose}>Inizia a lavorare <ArrowRight size={18} /></button>
      </div>
    </div>
  </dialog>;
}

export function EmptyWorkspace({ onCreate, onRefresh, onWelcome }: {
  onCreate: () => void; onRefresh: () => void; onWelcome: () => void;
}) {
  return <section className="pq-empty-workspace" aria-labelledby="pq-empty-title">
    <div className="pq-empty-main"><div>
      <span className="pq-kicker">PRONTI PER IL PRIMO STUDIO</span>
      <h2 id="pq-empty-title">Il tuo prossimo progetto<br />comincia qui.</h2>
      <p>Invia il primo studio dall’ERP: qui troverai immobili e documenti pronti per l’analisi. Puoi anche creare uno studio manualmente.</p>
      <div className="pq-empty-actions"><button className="button primary" onClick={onRefresh}><RefreshCw size={17} /> Aggiorna studi</button>
        <button className="button secondary" onClick={onCreate}>Crea uno studio</button></div>
      <button className="pq-welcome-link" onClick={onWelcome}>Scopri cosa puoi fare con PQ <ArrowRight size={15} /></button>
    </div><PlanIllustration /></div>
    <ol className="pq-start-steps">{[
      ["Importa", "Invia lo studio dall’ERP con i documenti disponibili."],
      ["Analizza", "Apri la planimetria, misura e valuta gli immobili."],
      ["Presenta", "Rivedi i dati e crea la presentazione PDF v3."],
    ].map(([title, text], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
  </section>;
}

export function TestStudiesToggle({ shown, count, onToggle }: { shown: boolean; count: number; onToggle: () => void }) {
  return <button className={`button secondary pq-test-toggle ${shown ? "active" : ""}`} aria-pressed={shown} onClick={onToggle}>
    <Layers3 size={16} />{shown ? "Nascondi gli studi di test" : "Mostra gli studi di test"}
    <span className="pq-test-count">{count}</span>
  </button>;
}
