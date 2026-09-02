import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.js?url";
import "./renderingLab.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SOURCE_PDF = "/render-lab/source.pdf";
const MAX_ADAPTIVE_EDGE = 4_096;
const MAX_ADAPTIVE_PIXELS = 16_000_000;

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

type VariantId = "baseline" | "native" | "adaptive-15" | "adaptive-20" | "contrast" | "ink-boost";

type Variant = {
  id: VariantId;
  code: string;
  title: string;
  shortTitle: string;
  description: string;
  quality: number;
  baseline?: boolean;
  cssFilter?: string;
  inkBoost?: boolean;
  recommended?: boolean;
};

const VARIANTS: Variant[] = [
  {
    id: "baseline",
    code: "A",
    title: "Baseline attuale — canvas fisso ×2",
    shortTitle: "Baseline attuale",
    description: "Replica il rendering oggi presente nell’editor: canvas molto grande ridotto via CSS.",
    quality: 2,
    baseline: true,
  },
  {
    id: "native",
    code: "B",
    title: "Adattivo — DPR nativo",
    shortTitle: "DPR nativo",
    description: "Il bitmap segue esattamente zoom e densità fisica dello schermo, senza sovracampionamento.",
    quality: 1,
  },
  {
    id: "adaptive-15",
    code: "C",
    title: "Adattivo — DPR ×1,5",
    shortTitle: "DPR ×1,5",
    description: "Aggiunge un margine moderato di dettaglio senza creare un canvas sproporzionato.",
    quality: 1.5,
    recommended: true,
  },
  {
    id: "adaptive-20",
    code: "D",
    title: "Adattivo — DPR ×2",
    shortTitle: "DPR ×2",
    description: "Più definizione del campione C, con maggiore uso di memoria e ricampionamento.",
    quality: 2,
  },
  {
    id: "contrast",
    code: "E",
    title: "Adattivo ×1,5 — contrasto leggero",
    shortTitle: "×1,5 + contrasto",
    description: "Parte dal campione C e applica un contrasto CSS lieve all’intera planimetria.",
    quality: 1.5,
    cssFilter: "contrast(1.16)",
  },
  {
    id: "ink-boost",
    code: "F",
    title: "Adattivo ×1,5 — rinforzo tratti",
    shortTitle: "×1,5 + tratti",
    description: "Parte dal campione C e rinforza di un pixel i segni scuri; può ispessire anche i testi.",
    quality: 1.5,
    inkBoost: true,
  },
];

type RenderStats = {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  ratio: number;
  physicalRatio: number;
  memoryMb: number;
  renderMs: number;
  capped: boolean;
};

export default function PdfRenderingLab() {
  const slug = window.location.pathname.split("/").filter(Boolean)[1];
  const variant = VARIANTS.find((candidate) => candidate.id === slug);
  if (!variant) return <LabIndex />;
  return <LabViewer variant={variant} />;
}

function LabIndex() {
  return (
    <main className="render-lab render-lab-index">
      <header className="render-lab-hero">
        <div>
          <span className="render-lab-eyebrow">Chrome PDF rendering lab</span>
          <h1>Confronto rendering planimetria</h1>
          <p>
            Sei pagine isolate, tutte basate sulla planimetria dello studio 961 / immobile 320129.
            Aprile sul PC Windows interessato, mantenendo lo zoom di Chrome al 100%.
          </p>
        </div>
        <a href="https://pq-soul.rainailab.com/studi/961/immobili/320129/planimetria" target="_blank" rel="noreferrer">
          Apri editor originale
        </a>
      </header>

      <section className="render-lab-instructions">
        <strong>Come confrontare</strong>
        <ol>
          <li>Aprire ciascun campione alla stessa dimensione della finestra.</li>
          <li>Controllare soprattutto muri sottili, quote, testi piccoli e fluidità dello zoom.</li>
          <li>Comunicare il codice preferito (A–F) e l’eventuale seconda scelta.</li>
        </ol>
      </section>

      <section className="render-lab-grid">
        {VARIANTS.map((variant) => (
          <a className="render-lab-card" href={`/render-lab/${variant.id}`} key={variant.id}>
            <span className="render-lab-code">{variant.code}</span>
            <div>
              <h2>{variant.shortTitle}</h2>
              <p>{variant.description}</p>
            </div>
            {variant.recommended && <em>Prima candidata</em>}
          </a>
        ))}
      </section>
    </main>
  );
}

function LabViewer({ variant }: { variant: Variant }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const pageRef = useRef<PdfPage | null>(null);
  const renderTaskRef = useRef<ReturnType<PdfPage["render"]> | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [manualZoom, setManualZoom] = useState(50);
  const [fitMode, setFitMode] = useState(true);
  const [status, setStatus] = useState("Caricamento PDF…");
  const [stats, setStats] = useState<RenderStats | null>(null);

  useEffect(() => {
    let disposed = false;
    const loadingTask = pdfjsLib.getDocument({ url: SOURCE_PDF, isEvalSupported: false });
    void loadingTask.promise
      .then(async (pdf) => {
        const page = await pdf.getPage(1);
        if (disposed) {
          await pdf.destroy();
          return;
        }
        const viewport = page.getViewport({ scale: 1 });
        pdfRef.current = pdf;
        pageRef.current = page;
        setPageSize({ width: viewport.width, height: viewport.height });
        setStatus("PDF pronto");
      })
      .catch((error) => {
        if (!disposed) setStatus(`Errore caricamento: ${error instanceof Error ? error.message : "sconosciuto"}`);
      });
    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      const pdf = pdfRef.current;
      pdfRef.current = null;
      pageRef.current = null;
      if (pdf) void pdf.destroy();
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const fitZoom = useMemo(() => {
    if (!pageSize.width || !pageSize.height || !viewportSize.width || !viewportSize.height) return 0.5;
    return clamp(
      Math.min((viewportSize.width - 40) / pageSize.width, (viewportSize.height - 40) / pageSize.height),
      0.15,
      1.5,
    );
  }, [pageSize, viewportSize]);
  const zoom = fitMode ? fitZoom : manualZoom / 100;
  const zoomPercent = Math.round(zoom * 100);

  useEffect(() => {
    const page = pageRef.current;
    const canvas = canvasRef.current;
    if (!page || !canvas || !pageSize.width || !pageSize.height || !zoom) return;

    const timer = window.setTimeout(() => {
      renderTaskRef.current?.cancel();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const baselineAnalysisScale = Math.max(1.4, Math.min(3.2, 3_800 / Math.max(pageSize.width, pageSize.height)));
      const requestedScale = variant.baseline
        ? baselineAnalysisScale * variant.quality
        : zoom * dpr * variant.quality;
      const constrained = constrainScale(requestedScale, pageSize.width, pageSize.height, variant.baseline === true);
      const renderViewport = page.getViewport({ scale: constrained.scale });
      const cssWidth = pageSize.width * zoom;
      const cssHeight = pageSize.height * zoom;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        setStatus("Canvas 2D non disponibile");
        return;
      }

      canvas.width = Math.max(1, Math.round(renderViewport.width));
      canvas.height = Math.max(1, Math.round(renderViewport.height));
      canvas.style.width = `${snapToPhysicalPixel(cssWidth, dpr)}px`;
      canvas.style.height = `${snapToPhysicalPixel(cssHeight, dpr)}px`;
      canvas.style.filter = variant.cssFilter ?? "none";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      setStatus("Rendering…");
      const startedAt = performance.now();
      const task = page.render({ canvasContext: context, viewport: renderViewport });
      renderTaskRef.current = task;
      void task.promise
        .then(() => {
          if (variant.inkBoost) reinforceDarkStrokes(context, canvas.width, canvas.height);
          const renderMs = performance.now() - startedAt;
          const actualCssWidth = Math.max(1, canvas.getBoundingClientRect().width);
          const ratio = canvas.width / actualCssWidth;
          setStats({
            cssWidth: actualCssWidth,
            cssHeight: Math.max(1, canvas.getBoundingClientRect().height),
            backingWidth: canvas.width,
            backingHeight: canvas.height,
            ratio,
            physicalRatio: ratio / dpr,
            memoryMb: (canvas.width * canvas.height * 4) / 1_000_000,
            renderMs,
            capped: constrained.capped,
          });
          setStatus("Pronto");
        })
        .catch((error) => {
          if ((error as { name?: string })?.name !== "RenderingCancelledException") {
            setStatus(`Errore rendering: ${error instanceof Error ? error.message : "sconosciuto"}`);
          }
        })
        .finally(() => {
          if (renderTaskRef.current === task) renderTaskRef.current = null;
        });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [pageSize, variant, zoom]);

  const browser = browserLabel();
  return (
    <main className="render-lab render-lab-viewer">
      <header className="render-lab-toolbar">
        <div className="render-lab-toolbar-title">
          <a href="/render-lab">← Tutti i campioni</a>
          <span className="render-lab-code">{variant.code}</span>
          <div>
            <h1>{variant.title}</h1>
            <p>{variant.description}</p>
          </div>
        </div>
        <div className="render-lab-controls">
          <button className={fitMode ? "active" : ""} type="button" onClick={() => setFitMode(true)}>
            Adatta pagina
          </button>
          <label>
            <span>Zoom {zoomPercent}%</span>
            <input
              type="range"
              min="20"
              max="150"
              step="5"
              value={fitMode ? zoomPercent : manualZoom}
              onChange={(event) => {
                setFitMode(false);
                setManualZoom(Number(event.target.value));
              }}
            />
          </label>
        </div>
      </header>

      <nav className="render-lab-switcher" aria-label="Cambia campione">
        {VARIANTS.map((candidate) => (
          <a
            className={candidate.id === variant.id ? "active" : ""}
            href={`/render-lab/${candidate.id}`}
            key={candidate.id}
            title={candidate.title}
          >
            {candidate.code}
          </a>
        ))}
      </nav>

      <section className="render-lab-diagnostics">
        <span><strong>Browser</strong> {browser}</span>
        <span><strong>DPR</strong> {formatNumber(window.devicePixelRatio || 1, 2)}</span>
        <span><strong>Viewport</strong> {viewportSize.width}×{viewportSize.height}</span>
        <span><strong>Zoom</strong> {zoomPercent}%</span>
        {stats && (
          <>
            <span><strong>Canvas</strong> {stats.backingWidth}×{stats.backingHeight}</span>
            <span><strong>CSS</strong> {Math.round(stats.cssWidth)}×{Math.round(stats.cssHeight)}</span>
            <span><strong>Riduzione fisica</strong> {formatNumber(stats.physicalRatio, 2)}×</span>
            <span><strong>Memoria grezza</strong> {formatNumber(stats.memoryMb, 1)} MB</span>
            <span><strong>Render</strong> {Math.round(stats.renderMs)} ms</span>
            {stats.capped && <span className="warning"><strong>Limite sicurezza applicato</strong></span>}
          </>
        )}
        <span className={`render-lab-status ${status === "Pronto" ? "ready" : ""}`}>{status}</span>
      </section>

      <section className="render-lab-canvas-viewport" ref={viewportRef}>
        <div
          className="render-lab-paper"
          style={{
            width: pageSize.width ? snapToPhysicalPixel(pageSize.width * zoom, window.devicePixelRatio || 1) : 0,
            height: pageSize.height ? snapToPhysicalPixel(pageSize.height * zoom, window.devicePixelRatio || 1) : 0,
          }}
        >
          <canvas ref={canvasRef} aria-label={`Planimetria campione ${variant.code}`} />
        </div>
      </section>

      <footer className="render-lab-footer">
        <strong>Valutazione suggerita:</strong> visibilità muri · leggibilità quote/testi · velocità zoom · resa generale.
        Comunicare il codice <b>{variant.code}</b> se questo è il campione preferito.
      </footer>
    </main>
  );
}

function constrainScale(scale: number, width: number, height: number, allowBaselineOverflow: boolean) {
  if (allowBaselineOverflow) return { scale, capped: false };
  const edgeFactor = MAX_ADAPTIVE_EDGE / Math.max(width * scale, height * scale);
  const pixelFactor = Math.sqrt(MAX_ADAPTIVE_PIXELS / Math.max(1, width * height * scale * scale));
  const factor = Math.min(1, edgeFactor, pixelFactor);
  return { scale: Math.max(0.1, scale * factor), capped: factor < 0.999 };
}

function reinforceDarkStrokes(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height);
  const source = image.data;
  const output = new Uint8ClampedArray(source);
  const pixelCount = width * height;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    const luminance = source[offset] * 0.299 + source[offset + 1] * 0.587 + source[offset + 2] * 0.114;
    if (luminance >= 225) continue;

    const strength = Math.min(92, (255 - luminance) * 0.34);
    darkenPixel(output, offset, Math.min(34, strength * 0.35));
    const x = pixel % width;
    if (x > 0) darkenPixel(output, offset - 4, strength);
    if (x + 1 < width) darkenPixel(output, offset + 4, strength);
    if (pixel >= width) darkenPixel(output, offset - width * 4, strength);
    if (pixel + width < pixelCount) darkenPixel(output, offset + width * 4, strength);
  }
  image.data.set(output);
  context.putImageData(image, 0, 0);
}

function darkenPixel(data: Uint8ClampedArray, offset: number, strength: number) {
  for (let channel = 0; channel < 3; channel++) {
    data[offset + channel] = Math.min(data[offset + channel], 255 - strength);
  }
}

function snapToPhysicalPixel(value: number, dpr: number) {
  return Math.round(value * Math.max(1, dpr)) / Math.max(1, dpr);
}

function browserLabel() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge / Chromium";
  if (/Chrome\//.test(ua)) return "Chrome / Chromium";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  if (/Firefox\//.test(ua)) return "Firefox";
  const userAgentData = (navigator as Navigator & {
    userAgentData?: { brands?: Array<{ brand: string }> };
  }).userAgentData;
  return userAgentData?.brands?.map((brand) => brand.brand).join(", ") || "Altro";
}

function formatNumber(value: number, digits: number) {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
