import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.js?url";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Factory,
  FileText,
  Home,
  Layers,
  MousePointer2,
  RotateCcw,
  Ruler,
  Trash2,
  Upload,
  X,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

type SheetSize = "A3" | "A4";
type UsageId =
  | "capannone"
  | "uffici"
  | "tettoie"
  | "sistemazione-esterna"
  | "verde"
  | "lotto";

type EditorStudy = {
  id: string;
  company: string;
};

type EditorProperty = {
  id: string;
  address: string;
  comune: string;
  categoria: string;
  currentRendita: number;
  estimatedRendita: number;
  documents: {
    planimetria: string;
    visura: string;
  };
};

type MaskBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type Region = {
  bounds: MaskBounds;
  seed: { x: number; y: number };
  count: number;
  alphaCanvas: HTMLCanvasElement;
  width: number;
  height: number;
};

type AreaSelection = {
  id: string;
  page: number;
  usageId: UsageId;
  color: string;
  opacity: number;
  region: Region;
  bitmap: HTMLCanvasElement;
};

type Runtime = {
  pdfDoc: PdfDocument | null;
  fileName: string;
  currentPage: number;
  pageCount: number;
  renderScale: number;
  zoom: number;
  selectionsByPage: Map<number, AreaSelection[]>;
  history: string[];
  wallMap: Uint8Array | null;
  wallKey: string;
  structureCanvas: HTMLCanvasElement | null;
  structureCtx: CanvasRenderingContext2D | null;
  structureInkPixels: number;
  wallSourceIsVector: boolean;
  renderTask: { promise: Promise<unknown>; cancel: () => void } | null;
  renderToken: number;
  animating: boolean;
};

type CanvasBundle = {
  pdfCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  waveCanvas: HTMLCanvasElement;
  pdf: CanvasRenderingContext2D;
  mask: CanvasRenderingContext2D;
  wave: CanvasRenderingContext2D;
};

type PlanimetriaEditorProps = {
  study: EditorStudy;
  property: EditorProperty;
  onBack: () => void;
};

const USAGES: Array<{
  id: UsageId;
  label: string;
  shortLabel: string;
  color: string;
  rate: number;
}> = [
  { id: "capannone", label: "Capannone", shortLabel: "Capannone", color: "#0d6efd", rate: 7.2 },
  { id: "uffici", label: "Uffici", shortLabel: "Uffici", color: "#7c3aed", rate: 12.4 },
  { id: "tettoie", label: "Tettoie", shortLabel: "Tettoie", color: "#f59e0b", rate: 3.1 },
  {
    id: "sistemazione-esterna",
    label: "Sistemazione esterna",
    shortLabel: "Esterni",
    color: "#16a34a",
    rate: 1.8,
  },
  { id: "verde", label: "Verde", shortLabel: "Verde", color: "#0f766e", rate: 0.4 },
  { id: "lotto", label: "Lotto", shortLabel: "Lotto", color: "#64748b", rate: 0.2 },
];

const SAMPLE_PLANS = [
  {
    label: "Esempio 1",
    fileName: "floor-plant-example.pdf",
    url: "/planimetrie/floor-plant-example.pdf",
  },
  {
    label: "Esempio 2",
    fileName: "floor-plant-example-2.pdf",
    url: "/planimetrie/floor-plant-example-2.pdf",
  },
  {
    label: "Esempio 3",
    fileName: "floor-plant-example-3.pdf",
    url: "/planimetrie/floor-plant-example-3.pdf",
  },
];

const SHEET_SIZES: Record<SheetSize, { widthMm: number; heightMm: number }> = {
  A3: { widthMm: 420, heightMm: 297 },
  A4: { widthMm: 297, heightMm: 210 },
};

const areaFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactAreaFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const moneyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

function createRuntime(): Runtime {
  return {
    pdfDoc: null,
    fileName: "",
    currentPage: 0,
    pageCount: 0,
    renderScale: 2,
    zoom: 1,
    selectionsByPage: new Map(),
    history: [],
    wallMap: null,
    wallKey: "",
    structureCanvas: null,
    structureCtx: null,
    structureInkPixels: 0,
    wallSourceIsVector: false,
    renderTask: null,
    renderToken: 0,
    animating: false,
  };
}

function usageById(id: UsageId) {
  return USAGES.find((usage) => usage.id === id) ?? USAGES[0];
}

function rgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatM2(value: number) {
  return `${areaFormatter.format(value)} m2`;
}

function formatCompactM2(value: number) {
  return `${compactAreaFormatter.format(value)} m2`;
}

function pageRealAreaM2(sheetSize: SheetSize, scaleDenominator: number) {
  const sheet = SHEET_SIZES[sheetSize];
  const width = (sheet.widthMm / 1000) * scaleDenominator;
  const height = (sheet.heightMm / 1000) * scaleDenominator;
  return width * height;
}

function areaFromPixels(
  pixelCount: number,
  totalPixels: number,
  sheetSize: SheetSize,
  scaleDenominator: number,
) {
  if (!totalPixels) return 0;
  return (pixelCount / totalPixels) * pageRealAreaM2(sheetSize, scaleDenominator);
}

function sampleForProperty(propertyId: string) {
  const sum = propertyId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return SAMPLE_PLANS[sum % SAMPLE_PLANS.length];
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function safeFilename(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[^\w-]+/g, "-");
}

export default function PlanimetriaEditor({ study, property, onBack }: PlanimetriaEditorProps) {
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runtimeRef = useRef<Runtime>(createRuntime());

  const [status, setStatus] = useState("Caricamento planimetria");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [canvasPixels, setCanvasPixels] = useState("0 x 0");
  const [activeUsage, setActiveUsage] = useState<UsageId>("capannone");
  const [scaleDenominator, setScaleDenominator] = useState(500);
  const [sheetSize, setSheetSize] = useState<SheetSize>("A3");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [opacityPercent, setOpacityPercent] = useState(44);
  const [threshold, setThreshold] = useState(236);
  const [inflate, setInflate] = useState(1);
  const [gap, setGap] = useState(3);
  const [dash, setDash] = useState(42);
  const [revision, setRevision] = useState(0);

  const sample = useMemo(() => sampleForProperty(property.id), [property.id]);
  const activeUsageOption = usageById(activeUsage);
  const hasPdf = pageCount > 0;
  const selections = hasPdf ? currentSelections() : [];
  const canvasTotalPixels = getCanvasTotalPixels();

  const selectedAreas = useMemo(
    () =>
      selections.map((selection, index) => {
        const usage = usageById(selection.usageId);
        const area = areaFromPixels(
          selection.region.count,
          canvasTotalPixels,
          sheetSize,
          scaleDenominator,
        );
        return {
          selection,
          index,
          usage,
          area,
          amount: area * usage.rate,
        };
      }),
    [canvasTotalPixels, scaleDenominator, selections, sheetSize, revision],
  );

  const totals = useMemo(() => {
    return selectedAreas.reduce(
      (acc, area) => {
        acc.area += area.area;
        acc.amount += area.amount;
        return acc;
      },
      { area: 0, amount: 0 },
    );
  }, [selectedAreas]);

  useEffect(() => {
    runtimeRef.current = createRuntime();
    setCurrentPage(0);
    setPageCount(0);
    setFileName("");
    setCanvasPixels("0 x 0");
    setRevision((value) => value + 1);
    void loadSample(sample.url, sample.fileName);

    return () => {
      const renderTask = runtimeRef.current.renderTask;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Render cancellation is best effort.
        }
      }
    };
    // The sample is derived from the currently selected property.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id]);

  function getCanvases(): CanvasBundle {
    const pdfCanvas = pdfCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const waveCanvas = waveCanvasRef.current;
    const pdf = pdfCanvas?.getContext("2d", { willReadFrequently: true });
    const mask = maskCanvas?.getContext("2d");
    const wave = waveCanvas?.getContext("2d");

    if (!pdfCanvas || !maskCanvas || !waveCanvas || !pdf || !mask || !wave) {
      throw new Error("Canvas non disponibile");
    }

    return { pdfCanvas, maskCanvas, waveCanvas, pdf, mask, wave };
  }

  function currentSelections() {
    const runtime = runtimeRef.current;
    if (!runtime.selectionsByPage.has(runtime.currentPage)) {
      runtime.selectionsByPage.set(runtime.currentPage, []);
    }
    return runtime.selectionsByPage.get(runtime.currentPage)!;
  }

  function getCanvasTotalPixels() {
    const canvas = pdfCanvasRef.current;
    return canvas ? canvas.width * canvas.height : 0;
  }

  function setEditorBusy(isBusy: boolean) {
    runtimeRef.current.animating = isBusy;
    setBusy(isBusy);
  }

  function bumpRevision() {
    setRevision((value) => value + 1);
  }

  async function loadSample(url: string, name: string) {
    try {
      setStatus("Caricamento PDF");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      await loadPdfFromData(data, name);
    } catch (error) {
      console.error(error);
      setStatus("PDF non caricato");
    }
  }

  async function loadPdfFile(file: File | undefined) {
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      await loadPdfFromData(data, file.name || "Planimetria importata.pdf");
    } catch (error) {
      console.error(error);
      setStatus("PDF non caricato");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function loadPdfFromData(data: ArrayBuffer, name: string) {
    const loadingTask = pdfjsLib.getDocument({ data });
    setEditorBusy(true);
    setStatus("Analisi PDF");
    try {
      const pdfDoc = await loadingTask.promise;
      const runtime = createRuntime();
      runtime.pdfDoc = pdfDoc;
      runtime.fileName = name;
      runtime.currentPage = 1;
      runtime.pageCount = pdfDoc.numPages;
      runtimeRef.current = runtime;
      setZoomPercent(100);
      setFileName(name);
      setPageCount(pdfDoc.numPages);
      setCurrentPage(1);
      await renderPage(1);
    } finally {
      setEditorBusy(false);
      bumpRevision();
    }
  }

  function resizeLayer(canvas: HTMLCanvasElement, width: number, height: number) {
    canvas.width = width;
    canvas.height = height;
  }

  function applyStageSize() {
    const runtime = runtimeRef.current;
    const { pdfCanvas } = getCanvases();
    const stage = stageRef.current;
    if (!stage) return;
    const width = (pdfCanvas.width / runtime.renderScale) * runtime.zoom;
    const height = (pdfCanvas.height / runtime.renderScale) * runtime.zoom;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    setCanvasPixels(`${pdfCanvas.width} x ${pdfCanvas.height}`);
  }

  function getFitZoomPercent() {
    const runtime = runtimeRef.current;
    const { pdfCanvas } = getCanvases();
    const shell = canvasShellRef.current;
    if (!shell || !pdfCanvas.width || !pdfCanvas.height) return zoomPercent;

    const pageWidth = pdfCanvas.width / runtime.renderScale;
    const pageHeight = pdfCanvas.height / runtime.renderScale;
    const shellRect = shell.getBoundingClientRect();
    const visibleHeight = window.innerHeight - shellRect.top - 56;
    const availableWidth = Math.max(280, shell.clientWidth - 56);
    const availableHeight = Math.max(320, Math.min(shell.clientHeight - 56, visibleHeight));
    const fit = Math.min(1.15, availableWidth / pageWidth, availableHeight / pageHeight);
    return Math.max(35, Math.min(140, Math.floor(fit * 100)));
  }

  function fitPageToViewport() {
    if (!runtimeRef.current.pdfDoc) return;
    const nextZoom = getFitZoomPercent();
    runtimeRef.current.zoom = nextZoom / 100;
    setZoomPercent(nextZoom);
    applyStageSize();
  }

  function getInkFocusPoint() {
    const { pdfCanvas, pdf } = getCanvases();
    const shell = canvasShellRef.current;
    const runtime = runtimeRef.current;
    const width = pdfCanvas.width;
    const height = pdfCanvas.height;
    if (!shell || !width || !height) return null;

    const data = pdf.getImageData(0, 0, width, height).data;
    const cell = 24;
    const cols = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const grid = new Uint16Array(cols * rows);
    const minContentX = width * 0.13;
    const maxContentX = width * 0.96;
    const minContentY = height * 0.02;
    const maxContentY = height * 0.92;

    for (let y = 0; y < height; y += 2) {
      if (y < minContentY || y > maxContentY) continue;
      const row = y * width;
      for (let x = 0; x < width; x += 2) {
        if (x < minContentX || x > maxContentX) continue;
        const p = (row + x) * 4;
        const alpha = data[p + 3];
        if (alpha < 10) continue;
        const lum = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
        if (lum > 218) continue;
        grid[Math.floor(y / cell) * cols + Math.floor(x / cell)]++;
      }
    }

    const visibleWidth = Math.min(
      width,
      Math.max(320, ((shell.clientWidth - 56) / Math.max(runtime.zoom, 0.01)) * runtime.renderScale),
    );
    const visibleHeight = Math.min(
      height,
      Math.max(320, ((shell.clientHeight - 56) / Math.max(runtime.zoom, 0.01)) * runtime.renderScale),
    );
    const windowCols = Math.max(1, Math.min(cols, Math.round(visibleWidth / cell)));
    const windowRows = Math.max(1, Math.min(rows, Math.round(visibleHeight / cell)));
    const integral = new Uint32Array((cols + 1) * (rows + 1));

    for (let y = 0; y < rows; y++) {
      let rowSum = 0;
      for (let x = 0; x < cols; x++) {
        rowSum += grid[y * cols + x];
        integral[(y + 1) * (cols + 1) + x + 1] = integral[y * (cols + 1) + x + 1] + rowSum;
      }
    }

    let bestScore = 0;
    let bestX = Math.floor(cols / 2);
    let bestY = Math.floor(rows / 2);
    for (let y = 0; y <= rows - windowRows; y++) {
      for (let x = 0; x <= cols - windowCols; x++) {
        const x2 = x + windowCols;
        const y2 = y + windowRows;
        const score =
          integral[y2 * (cols + 1) + x2] -
          integral[y * (cols + 1) + x2] -
          integral[y2 * (cols + 1) + x] +
          integral[y * (cols + 1) + x];
        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }

    if (bestScore < 12) return null;
    return {
      x: Math.min(width, (bestX + windowCols / 2) * cell),
      y: Math.min(height, (bestY + windowRows / 2) * cell),
    };
  }

  function focusRenderedContent() {
    const shell = canvasShellRef.current;
    const stage = stageRef.current;
    const runtime = runtimeRef.current;
    if (!shell || !stage || !runtime.pdfDoc) return;

    const focus = getInkFocusPoint();
    if (!focus) return;

    const targetX = stage.offsetLeft + (focus.x / runtime.renderScale) * runtime.zoom;
    const targetY = stage.offsetTop + (focus.y / runtime.renderScale) * runtime.zoom;
    shell.scrollLeft = Math.max(0, targetX - shell.clientWidth / 2);
    shell.scrollTop = Math.max(0, targetY - shell.clientHeight / 2);
  }

  async function renderPage(pageNumber: number) {
    const runtime = runtimeRef.current;
    if (!runtime.pdfDoc) return false;
    const token = ++runtime.renderToken;
    if (runtime.renderTask) {
      try {
        runtime.renderTask.cancel();
      } catch (error) {
        console.warn("Render precedente non annullato", error);
      }
      runtime.renderTask = null;
    }

    setEditorBusy(true);
    setStatus("Rendering pagina");
    try {
      const page = await runtime.pdfDoc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const maxEdge = 2900;
      runtime.renderScale = Math.max(
        1.4,
        Math.min(2.45, maxEdge / Math.max(baseViewport.width, baseViewport.height)),
      );
      const viewport = page.getViewport({ scale: runtime.renderScale });
      const width = Math.round(viewport.width);
      const height = Math.round(viewport.height);
      const { pdfCanvas, maskCanvas, waveCanvas, pdf } = getCanvases();

      resizeLayer(pdfCanvas, width, height);
      resizeLayer(maskCanvas, width, height);
      resizeLayer(waveCanvas, width, height);
      pdf.fillStyle = "#ffffff";
      pdf.fillRect(0, 0, width, height);

      const renderTask = page.render({ canvasContext: pdf, viewport });
      runtime.renderTask = renderTask;
      try {
        await renderTask.promise;
      } catch (error) {
        if ((error as { name?: string })?.name === "RenderingCancelledException") return false;
        throw error;
      } finally {
        if (runtime.renderTask === renderTask) runtime.renderTask = null;
      }

      if (token !== runtime.renderToken) return false;
      const structureLayer = await buildStructureLayer(page, viewport, width, height);
      if (token !== runtime.renderToken) return false;

      runtime.currentPage = pageNumber;
      runtime.wallMap = null;
      runtime.wallKey = "";
      runtime.structureCanvas = structureLayer.canvas;
      runtime.structureCtx = structureLayer.ctx;
      runtime.structureInkPixels = structureLayer.inkPixels;
      runtime.wallSourceIsVector = structureLayer.inkPixels > 600;
      setCurrentPage(pageNumber);
      applyStageSize();
      redrawMasks();
      window.requestAnimationFrame(focusRenderedContent);
      setStatus("Pronto per selezione");
      bumpRevision();
      return true;
    } catch (error) {
      console.error(error);
      setStatus("Rendering non riuscito");
      return false;
    } finally {
      if (token === runtime.renderToken) setEditorBusy(false);
    }
  }

  function drawConstructedPath(targetCtx: CanvasRenderingContext2D, args: unknown[]) {
    const OPS = (pdfjsLib as unknown as { OPS: Record<string, number> }).OPS || {};
    const ops = (args[0] || []) as number[];
    const coords = (args[1] || []) as number[];
    let c = 0;
    let currentX = 0;
    let currentY = 0;

    for (const op of ops) {
      if (op === OPS.rectangle) {
        const x = coords[c++];
        const y = coords[c++];
        const w = coords[c++];
        const h = coords[c++];
        targetCtx.rect(x, y, w, h);
      } else if (op === OPS.moveTo) {
        currentX = coords[c++];
        currentY = coords[c++];
        targetCtx.moveTo(currentX, currentY);
      } else if (op === OPS.lineTo) {
        currentX = coords[c++];
        currentY = coords[c++];
        targetCtx.lineTo(currentX, currentY);
      } else if (op === OPS.curveTo) {
        const x1 = coords[c++];
        const y1 = coords[c++];
        const x2 = coords[c++];
        const y2 = coords[c++];
        currentX = coords[c++];
        currentY = coords[c++];
        targetCtx.bezierCurveTo(x1, y1, x2, y2, currentX, currentY);
      } else if (op === OPS.curveTo2) {
        const x1 = currentX;
        const y1 = currentY;
        const x2 = coords[c++];
        const y2 = coords[c++];
        currentX = coords[c++];
        currentY = coords[c++];
        targetCtx.bezierCurveTo(x1, y1, x2, y2, currentX, currentY);
      } else if (op === OPS.curveTo3) {
        const x1 = coords[c++];
        const y1 = coords[c++];
        currentX = coords[c++];
        currentY = coords[c++];
        targetCtx.bezierCurveTo(x1, y1, currentX, currentY, currentX, currentY);
      } else if (op === OPS.closePath) {
        targetCtx.closePath();
      }
    }
  }

  function applyGraphicsState(targetCtx: CanvasRenderingContext2D, states: unknown[]) {
    for (const state of states || []) {
      const entry = state as [string, unknown];
      const key = entry[0];
      const value = entry[1];
      if (key === "LW") targetCtx.lineWidth = Number(value);
      if (key === "LC") targetCtx.lineCap = (["butt", "round", "square"][Number(value)] ||
        "butt") as CanvasLineCap;
      if (key === "LJ") targetCtx.lineJoin = (["miter", "round", "bevel"][Number(value)] ||
        "miter") as CanvasLineJoin;
      if (key === "D") {
        const dashValue = value as [number[], number];
        targetCtx.setLineDash(dashValue[0] || []);
        targetCtx.lineDashOffset = dashValue[1] || 0;
      }
    }
  }

  function countInkPixels(canvasCtx: CanvasRenderingContext2D, width: number, height: number) {
    const data = canvasCtx.getImageData(0, 0, width, height).data;
    let count = 0;
    for (let p = 3; p < data.length; p += 4) {
      if (data[p] > 8) count++;
    }
    return count;
  }

  async function buildStructureLayer(
    page: PdfPage,
    viewport: ReturnType<PdfPage["getViewport"]>,
    width: number,
    height: number,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const targetCtx = canvas.getContext("2d", { willReadFrequently: true });
    if (!targetCtx) throw new Error("Contesto canvas non disponibile");
    const OPS = (pdfjsLib as unknown as { OPS: Record<string, number> }).OPS || {};
    const operatorList = await page.getOperatorList();

    targetCtx.save();
    targetCtx.setTransform(...(viewport.transform as [number, number, number, number, number, number]));
    targetCtx.strokeStyle = "#000000";
    targetCtx.fillStyle = "#000000";
    targetCtx.lineWidth = 1;
    targetCtx.lineCap = "butt";
    targetCtx.lineJoin = "miter";

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      const args = (operatorList.argsArray[i] || []) as unknown[];

      if (fn === OPS.save) {
        targetCtx.save();
      } else if (fn === OPS.restore) {
        targetCtx.restore();
      } else if (fn === OPS.transform) {
        targetCtx.transform(...(args as [number, number, number, number, number, number]));
      } else if (fn === OPS.setLineWidth) {
        targetCtx.lineWidth = Number(args[0]) || 1;
      } else if (fn === OPS.setLineCap) {
        targetCtx.lineCap = (["butt", "round", "square"][Number(args[0])] ||
          "butt") as CanvasLineCap;
      } else if (fn === OPS.setLineJoin) {
        targetCtx.lineJoin = (["miter", "round", "bevel"][Number(args[0])] ||
          "miter") as CanvasLineJoin;
      } else if (fn === OPS.setDash) {
        targetCtx.setLineDash((args[0] as number[]) || []);
        targetCtx.lineDashOffset = Number(args[1]) || 0;
      } else if (fn === OPS.setGState) {
        applyGraphicsState(targetCtx, args[0] as unknown[]);
      } else if (fn === OPS.constructPath) {
        drawConstructedPath(targetCtx, args);
      } else if (fn === OPS.stroke) {
        targetCtx.stroke();
        targetCtx.beginPath();
      } else if (fn === OPS.closeStroke) {
        targetCtx.closePath();
        targetCtx.stroke();
        targetCtx.beginPath();
      } else if (fn === OPS.fillStroke || fn === OPS.eoFillStroke) {
        targetCtx.fill(fn === OPS.eoFillStroke ? "evenodd" : "nonzero");
        targetCtx.stroke();
        targetCtx.beginPath();
      } else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.endPath) {
        targetCtx.beginPath();
      }
    }

    targetCtx.restore();
    const inkPixels = countInkPixels(targetCtx, width, height);
    return { canvas, ctx: targetCtx, inkPixels };
  }

  function currentWallKey() {
    const { pdfCanvas } = getCanvases();
    const runtime = runtimeRef.current;
    return [
      runtime.currentPage,
      pdfCanvas.width,
      pdfCanvas.height,
      threshold,
      inflate,
      gap,
      dash,
    ].join(":");
  }

  function countMapPixels(map: Uint8Array) {
    let count = 0;
    for (let i = 0; i < map.length; i++) {
      if (map[i]) count++;
    }
    return count;
  }

  function buildWallMap() {
    const runtime = runtimeRef.current;
    const key = currentWallKey();
    if (runtime.wallMap && runtime.wallKey === key) return runtime.wallMap;

    const { pdfCanvas, pdf } = getCanvases();
    const width = pdfCanvas.width;
    const height = pdfCanvas.height;
    const size = width * height;
    const useVectorSource = runtime.wallSourceIsVector && runtime.structureCtx;
    const sourceCtx = useVectorSource ? runtime.structureCtx! : pdf;
    const data = sourceCtx.getImageData(0, 0, width, height).data;
    const rawMap = new Uint8Array(size);

    for (let i = 0, p = 0; i < size; i++, p += 4) {
      const alpha = data[p + 3];
      if (alpha < 10) continue;
      if (useVectorSource) {
        rawMap[i] = 1;
        continue;
      }
      const lum = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
      if (lum < threshold) rawMap[i] = 1;
    }

    let map = useVectorSource ? rawMap : filterStructuralInk(rawMap, width, height);
    if (gap > 0) map = closeGaps(map, width, height, gap);
    if (dash > 0) {
      const beforeBridge = countMapPixels(map);
      const bridged = bridgeDashedLines(map, width, height, dash);
      const addedRatio = (countMapPixels(bridged) - beforeBridge) / Math.max(1, beforeBridge);
      map = addedRatio > 0.55 && dash > 14 ? bridgeDashedLines(map, width, height, 12) : bridged;
    }
    if (!useVectorSource) map = removeSmallComponents(map, width, height, 24, 220);
    if (inflate > 0) map = dilate(map, width, height, inflate);

    runtime.wallMap = map;
    runtime.wallKey = key;
    return map;
  }

  function walkComponent(
    map: Uint8Array,
    seen: Uint8Array,
    width: number,
    height: number,
    start: number,
    queue: Int32Array,
  ) {
    let head = 0;
    let tail = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    queue[tail++] = start;
    seen[start] = 1;

    while (head < tail) {
      const idx = queue[head++];
      const y = Math.floor(idx / width);
      const x = idx - y * width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(height - 1, y + 1);
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(width - 1, x + 1);
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * width;
        for (let xx = x0; xx <= x1; xx++) {
          const next = row + xx;
          if (seen[next] || !map[next]) continue;
          seen[next] = 1;
          queue[tail++] = next;
        }
      }
    }

    return { end: tail, minX, minY, maxX, maxY, area: tail };
  }

  function filterStructuralInk(rawMap: Uint8Array, width: number, height: number) {
    const size = width * height;
    const out = new Uint8Array(size);
    const seen = new Uint8Array(size);
    const queue = new Int32Array(size);

    for (let i = 0; i < size; i++) {
      if (seen[i] || !rawMap[i]) continue;
      const component = walkComponent(rawMap, seen, width, height, i, queue);
      const w = component.maxX - component.minX + 1;
      const h = component.maxY - component.minY + 1;
      const density = component.area / (w * h);
      const lineish = (w >= 10 && h <= 8 && w >= h * 2) || (h >= 10 && w <= 8 && h >= w * 2);
      const dotish = w <= 8 && h <= 8 && component.area >= 2;
      const longSparseLine = (w >= 70 || h >= 70) && density <= 0.14;
      const sparseSymbol = (w >= 35 || h >= 35) && density <= 0.11 && component.area <= 260;

      if (lineish || dotish || longSparseLine || sparseSymbol) {
        for (let q = 0; q < component.end; q++) out[queue[q]] = 1;
      }
    }

    return out;
  }

  function removeSmallComponents(map: Uint8Array, width: number, height: number, minSpan: number, minArea: number) {
    const size = width * height;
    const out = new Uint8Array(size);
    const seen = new Uint8Array(size);
    const queue = new Int32Array(size);

    for (let i = 0; i < size; i++) {
      if (seen[i] || !map[i]) continue;
      const component = walkComponent(map, seen, width, height, i, queue);
      const w = component.maxX - component.minX + 1;
      const h = component.maxY - component.minY + 1;
      if (w >= minSpan || h >= minSpan || component.area >= minArea) {
        for (let q = 0; q < component.end; q++) out[queue[q]] = 1;
      }
    }

    return out;
  }

  function closeGaps(map: Uint8Array, width: number, height: number, maxGap: number) {
    const out = new Uint8Array(map);

    for (let y = 0; y < height; y++) {
      const row = y * width;
      let last = -1;
      for (let x = 0; x < width; x++) {
        if (!map[row + x]) continue;
        if (last >= 0) {
          const span = x - last - 1;
          if (span > 0 && span <= maxGap) {
            for (let fill = last + 1; fill < x; fill++) out[row + fill] = 1;
          }
        }
        last = x;
      }
    }

    for (let x = 0; x < width; x++) {
      let last = -1;
      for (let y = 0; y < height; y++) {
        const idx = y * width + x;
        if (!map[idx]) continue;
        if (last >= 0) {
          const span = y - last - 1;
          if (span > 0 && span <= maxGap) {
            for (let fill = last + 1; fill < y; fill++) out[fill * width + x] = 1;
          }
        }
        last = y;
      }
    }

    return out;
  }

  function hasPixelInHorizontalBand(
    map: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number,
    band: number,
  ) {
    const y0 = Math.max(0, y - band);
    const y1 = Math.min(height - 1, y + band);
    for (let yy = y0; yy <= y1; yy++) {
      if (map[yy * width + x]) return true;
    }
    return false;
  }

  function hasPixelInVerticalBand(
    map: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number,
    band: number,
  ) {
    const x0 = Math.max(0, x - band);
    const x1 = Math.min(width - 1, x + band);
    const row = y * width;
    for (let xx = x0; xx <= x1; xx++) {
      if (map[row + xx]) return true;
    }
    return false;
  }

  function paintHorizontalBridge(
    out: Uint8Array,
    width: number,
    height: number,
    y: number,
    fromX: number,
    toX: number,
    band: number,
  ) {
    const y0 = Math.max(0, y - band);
    const y1 = Math.min(height - 1, y + band);
    for (let yy = y0; yy <= y1; yy++) {
      const row = yy * width;
      for (let x = fromX; x <= toX; x++) out[row + x] = 1;
    }
  }

  function paintVerticalBridge(
    out: Uint8Array,
    width: number,
    height: number,
    x: number,
    fromY: number,
    toY: number,
    band: number,
  ) {
    const x0 = Math.max(0, x - band);
    const x1 = Math.min(width - 1, x + band);
    for (let y = fromY; y <= toY; y++) {
      const row = y * width;
      for (let xx = x0; xx <= x1; xx++) out[row + xx] = 1;
    }
  }

  function bridgeDashedLines(map: Uint8Array, width: number, height: number, maxGap: number) {
    const out = new Uint8Array(map);
    const band = Math.max(1, Math.min(5, Math.round(maxGap / 16)));
    const minRun = Math.max(3, Math.round(maxGap * 0.08));

    for (let y = 0; y < height; y++) {
      let previous: { end: number; length: number } | null = null;
      let x = 0;
      while (x < width) {
        while (x < width && !hasPixelInHorizontalBand(map, width, height, x, y, band)) x++;
        if (x >= width) break;
        const start = x;
        while (x < width && hasPixelInHorizontalBand(map, width, height, x, y, band)) x++;
        const end = x - 1;
        const length = end - start + 1;

        if (length >= minRun) {
          if (previous) {
            const localGap = start - previous.end - 1;
            if (localGap > 0 && localGap <= maxGap) {
              paintHorizontalBridge(out, width, height, y, previous.end + 1, start - 1, band);
            }
          }
          previous = { end, length };
        }
      }
    }

    for (let x = 0; x < width; x++) {
      let previous: { end: number; length: number } | null = null;
      let y = 0;
      while (y < height) {
        while (y < height && !hasPixelInVerticalBand(map, width, height, x, y, band)) y++;
        if (y >= height) break;
        const start = y;
        while (y < height && hasPixelInVerticalBand(map, width, height, x, y, band)) y++;
        const end = y - 1;
        const length = end - start + 1;

        if (length >= minRun) {
          if (previous) {
            const localGap = start - previous.end - 1;
            if (localGap > 0 && localGap <= maxGap) {
              paintVerticalBridge(out, width, height, x, previous.end + 1, start - 1, band);
            }
          }
          previous = { end, length };
        }
      }
    }

    return out;
  }

  function dilate(map: Uint8Array, width: number, height: number, radius: number) {
    const out = new Uint8Array(map);
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      for (let x = 0; x < width; x++) {
        if (!map[y * width + x]) continue;
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(width - 1, x + radius);
        for (let yy = y0; yy <= y1; yy++) {
          const row = yy * width;
          for (let xx = x0; xx <= x1; xx++) out[row + xx] = 1;
        }
      }
    }
    return out;
  }

  function scoreOpenPixel(x: number, y: number, wallMap: Uint8Array, width: number, height: number) {
    let score = 0;
    const radius = 3;
    const minX = Math.max(0, x - radius);
    const maxX = Math.min(width - 1, x + radius);
    const minY = Math.max(0, y - radius);
    const maxY = Math.min(height - 1, y + radius);
    for (let yy = minY; yy <= maxY; yy++) {
      const row = yy * width;
      for (let xx = minX; xx <= maxX; xx++) {
        if (!wallMap[row + xx]) score++;
      }
    }
    return score;
  }

  function findNearestOpen(sx: number, sy: number, wallMap: Uint8Array, width: number, height: number) {
    let best: { x: number; y: number; score: number } | null = null;

    function consider(x: number, y: number, radius: number) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      if (wallMap[y * width + x]) return;
      const score = scoreOpenPixel(x, y, wallMap, width, height) - radius * 0.35;
      if (!best || score > best.score) best = { x, y, score };
    }

    consider(sx, sy, 0);
    const initialBest = best as { x: number; y: number; score: number } | null;
    if (initialBest && initialBest.score >= 18) return { x: initialBest.x, y: initialBest.y };

    for (let radius = 1; radius <= 18; radius++) {
      const minX = Math.max(0, sx - radius);
      const maxX = Math.min(width - 1, sx + radius);
      const minY = Math.max(0, sy - radius);
      const maxY = Math.min(height - 1, sy + radius);

      for (let x = minX; x <= maxX; x++) {
        consider(x, minY, radius);
        consider(x, maxY, radius);
      }
      for (let y = minY; y <= maxY; y++) {
        consider(minX, y, radius);
        consider(maxX, y, radius);
      }
      const loopBest = best as { x: number; y: number; score: number } | null;
      if (loopBest && loopBest.score >= 22) return { x: loopBest.x, y: loopBest.y };
    }

    const finalBest = best as { x: number; y: number; score: number } | null;
    return finalBest ? { x: finalBest.x, y: finalBest.y } : null;
  }

  function floodFill(sx: number, sy: number) {
    const { pdfCanvas } = getCanvases();
    const width = pdfCanvas.width;
    const height = pdfCanvas.height;
    const size = width * height;
    const wallMap = buildWallMap();
    const seed = findNearestOpen(sx, sy, wallMap, width, height);
    if (!seed) return null;

    const visited = new Uint8Array(size);
    const mask = new Uint8Array(size);
    const stack = new Int32Array(size);
    let stackPointer = 0;
    let count = 0;
    let minX = seed.x;
    let maxX = seed.x;
    let minY = seed.y;
    let maxY = seed.y;
    stack[stackPointer++] = seed.y * width + seed.x;

    while (stackPointer > 0) {
      const start = stack[--stackPointer];
      const y = Math.floor(start / width);
      const x = start - y * width;
      let idx = y * width + x;
      if (visited[idx] || wallMap[idx]) continue;

      let left = x;
      while (left >= 0) {
        const i = y * width + left;
        if (visited[i] || wallMap[i]) break;
        left--;
      }
      left++;

      let right = x;
      while (right < width) {
        const i = y * width + right;
        if (visited[i] || wallMap[i]) break;
        right++;
      }
      right--;

      let spanUp = false;
      let spanDown = false;
      const row = y * width;

      for (let xx = left; xx <= right; xx++) {
        idx = row + xx;
        visited[idx] = 1;
        mask[idx] = 1;
        count++;
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        if (y > 0) {
          const up = idx - width;
          if (!visited[up] && !wallMap[up]) {
            if (!spanUp) {
              stack[stackPointer++] = up;
              spanUp = true;
            }
          } else {
            spanUp = false;
          }
        }

        if (y < height - 1) {
          const down = idx + width;
          if (!visited[down] && !wallMap[down]) {
            if (!spanDown) {
              stack[stackPointer++] = down;
              spanDown = true;
            }
          } else {
            spanDown = false;
          }
        }
      }
    }

    if (count < 8) return null;
    return makeRegion(mask, { minX, minY, maxX, maxY }, seed, count, width, height, wallMap);
  }

  function includeNearbyBarriers(
    mask: Uint8Array,
    wallMap: Uint8Array,
    bounds: MaskBounds,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    const visual = new Uint8Array(mask);
    const radius = Math.max(4, Math.min(8, inflate + Math.ceil(dash / 12)));
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      const row = y * canvasWidth;
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const idx = row + x;
        if (!mask[idx]) continue;
        const y0 = Math.max(0, y - radius);
        const y1 = Math.min(canvasHeight - 1, y + radius);
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(canvasWidth - 1, x + radius);
        for (let yy = y0; yy <= y1; yy++) {
          const scan = yy * canvasWidth;
          for (let xx = x0; xx <= x1; xx++) {
            const next = scan + xx;
            if (wallMap[next]) visual[next] = 1;
          }
        }
      }
    }
    return visual;
  }

  function computeMaskBounds(mask: Uint8Array, width: number, height: number) {
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    let count = 0;

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (!mask[row + x]) continue;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (count === 0) return null;
    return { minX, minY, maxX, maxY, count };
  }

  function fillClosedHoles(
    mask: Uint8Array,
    bounds: (MaskBounds & { count?: number }) | null,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    if (!bounds) return;
    const pad = 2;
    const minX = Math.max(0, bounds.minX - pad);
    const minY = Math.max(0, bounds.minY - pad);
    const maxX = Math.min(canvasWidth - 1, bounds.maxX + pad);
    const maxY = Math.min(canvasHeight - 1, bounds.maxY + pad);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const size = width * height;
    const outside = new Uint8Array(size);
    const holeSeen = new Uint8Array(size);
    const queue = new Int32Array(size);
    let head = 0;
    let tail = 0;

    function pushLocal(x: number, y: number) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const local = y * width + x;
      const global = (minY + y) * canvasWidth + minX + x;
      if (outside[local] || mask[global]) return;
      outside[local] = 1;
      queue[tail++] = local;
    }

    for (let x = 0; x < width; x++) {
      pushLocal(x, 0);
      pushLocal(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      pushLocal(0, y);
      pushLocal(width - 1, y);
    }

    while (head < tail) {
      const local = queue[head++];
      const y = Math.floor(local / width);
      const x = local - y * width;
      pushLocal(x + 1, y);
      pushLocal(x - 1, y);
      pushLocal(x, y + 1);
      pushLocal(x, y - 1);
    }

    const maxHoleArea = Math.min(7000, Math.max(160, Math.round((bounds.count || 0) * 0.018)));
    const maxHoleSpan = Math.max(18, Math.min(120, Math.round(Math.min(width, height) * 0.16)));

    function pushHole(x: number, y: number) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const local = y * width + x;
      const global = (minY + y) * canvasWidth + minX + x;
      if (holeSeen[local] || outside[local] || mask[global]) return;
      holeSeen[local] = 1;
      queue[tail++] = local;
    }

    for (let y = 0; y < height; y++) {
      const globalRow = (minY + y) * canvasWidth + minX;
      for (let x = 0; x < width; x++) {
        const local = y * width + x;
        const global = globalRow + x;
        if (outside[local] || holeSeen[local] || mask[global]) continue;

        head = 0;
        tail = 0;
        pushHole(x, y);
        let area = 0;
        let holeMinX = x;
        let holeMaxX = x;
        let holeMinY = y;
        let holeMaxY = y;

        while (head < tail) {
          const next = queue[head++];
          const yy = Math.floor(next / width);
          const xx = next - yy * width;
          area++;
          if (xx < holeMinX) holeMinX = xx;
          if (xx > holeMaxX) holeMaxX = xx;
          if (yy < holeMinY) holeMinY = yy;
          if (yy > holeMaxY) holeMaxY = yy;
          pushHole(xx + 1, yy);
          pushHole(xx - 1, yy);
          pushHole(xx, yy + 1);
          pushHole(xx, yy - 1);
        }

        const spanX = holeMaxX - holeMinX + 1;
        const spanY = holeMaxY - holeMinY + 1;
        const compactArtifact = spanX <= maxHoleSpan && spanY <= maxHoleSpan;
        const thinArtifact = Math.min(spanX, spanY) <= 28;
        if (area <= maxHoleArea && (compactArtifact || thinArtifact)) {
          for (let i = 0; i < tail; i++) {
            const fillLocal = queue[i];
            const yy = Math.floor(fillLocal / width);
            const xx = fillLocal - yy * width;
            mask[(minY + yy) * canvasWidth + minX + xx] = 1;
          }
        }
      }
    }
  }

  function makeRegion(
    mask: Uint8Array,
    bounds: MaskBounds,
    seed: { x: number; y: number },
    count: number,
    canvasWidth: number,
    canvasHeight: number,
    wallMap: Uint8Array,
  ): Region {
    const visualMask = includeNearbyBarriers(mask, wallMap, bounds, canvasWidth, canvasHeight);
    let visualBounds = computeMaskBounds(visualMask, canvasWidth, canvasHeight);
    fillClosedHoles(visualMask, visualBounds, canvasWidth, canvasHeight);
    visualBounds = computeMaskBounds(visualMask, canvasWidth, canvasHeight) || { ...bounds, count };

    const finalBounds = {
      minX: visualBounds.minX,
      minY: visualBounds.minY,
      maxX: visualBounds.maxX,
      maxY: visualBounds.maxY,
    };
    const finalCount = visualBounds.count;
    const width = finalBounds.maxX - finalBounds.minX + 1;
    const height = finalBounds.maxY - finalBounds.minY + 1;
    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = width;
    alphaCanvas.height = height;
    const alphaCtx = alphaCanvas.getContext("2d");
    if (!alphaCtx) throw new Error("Contesto alpha non disponibile");
    const image = alphaCtx.createImageData(width, height);

    for (let y = finalBounds.minY; y <= finalBounds.maxY; y++) {
      const srcRow = y * canvasWidth;
      const dstRow = (y - finalBounds.minY) * width;
      for (let x = finalBounds.minX; x <= finalBounds.maxX; x++) {
        if (!visualMask[srcRow + x]) continue;
        image.data[(dstRow + (x - finalBounds.minX)) * 4 + 3] = 255;
      }
    }
    alphaCtx.putImageData(image, 0, 0);

    return {
      bounds: finalBounds,
      seed,
      count: finalCount,
      alphaCanvas,
      width,
      height,
    };
  }

  function createTintedCanvas(region: Region, color: string, opacity: number) {
    const canvas = document.createElement("canvas");
    canvas.width = region.width;
    canvas.height = region.height;
    const canvasCtx = canvas.getContext("2d");
    if (!canvasCtx) throw new Error("Contesto maschera non disponibile");
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.fillStyle = rgba(color, opacity);
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.globalCompositeOperation = "destination-in";
    canvasCtx.drawImage(region.alphaCanvas, 0, 0);
    canvasCtx.globalCompositeOperation = "source-over";
    return canvas;
  }

  function sameRegion(a: Region, b: Region) {
    return (
      a.count === b.count &&
      a.bounds.minX === b.bounds.minX &&
      a.bounds.minY === b.bounds.minY &&
      a.bounds.maxX === b.bounds.maxX &&
      a.bounds.maxY === b.bounds.maxY
    );
  }

  function commitSelection(region: Region, usageId: UsageId, opacity: number) {
    const usage = usageById(usageId);
    const selectionsForPage = currentSelections();
    const duplicateIndex = selectionsForPage.findIndex((selection) => sameRegion(selection.region, region));

    if (duplicateIndex >= 0) {
      const selection = selectionsForPage[duplicateIndex];
      selection.usageId = usageId;
      selection.color = usage.color;
      selection.opacity = opacity;
      selection.region = region;
      selection.bitmap = createTintedCanvas(region, usage.color, opacity);
      redrawMasks();
      setStatus(`Area ${duplicateIndex + 1} aggiornata`);
      bumpRevision();
      return;
    }

    const selection = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      page: runtimeRef.current.currentPage,
      usageId,
      color: usage.color,
      opacity,
      region,
      bitmap: createTintedCanvas(region, usage.color, opacity),
    };
    selectionsForPage.push(selection);
    runtimeRef.current.history.push(selection.id);
    redrawMasks();
    setStatus(`Area ${selectionsForPage.length} tracciata`);
    bumpRevision();
  }

  function redrawMasks() {
    const { maskCanvas, mask } = getCanvases();
    mask.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    if (!runtimeRef.current.pdfDoc) return;
    currentSelections().forEach((selection) => {
      mask.drawImage(selection.bitmap, selection.region.bounds.minX, selection.region.bounds.minY);
    });
  }

  function animateWave(region: Region, color: string, opacity: number) {
    return new Promise<void>((resolve) => {
      const { waveCanvas, wave } = getCanvases();
      const temp = document.createElement("canvas");
      temp.width = region.width;
      temp.height = region.height;
      const tempCtx = temp.getContext("2d");
      if (!tempCtx) {
        resolve();
        return;
      }
      const tempContext = tempCtx;
      const localX = region.seed.x - region.bounds.minX;
      const localY = region.seed.y - region.bounds.minY;
      const maxRadius = Math.max(
        Math.hypot(localX, localY),
        Math.hypot(region.width - localX, localY),
        Math.hypot(localX, region.height - localY),
        Math.hypot(region.width - localX, region.height - localY),
      );
      const start = performance.now();
      const duration = 620;

      function frame(now: number) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const radius = Math.max(1, maxRadius * eased);
        const band = 30 + 24 * (1 - eased);

        wave.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
        tempContext.clearRect(0, 0, temp.width, temp.height);
        tempContext.fillStyle = rgba(color, opacity * 0.72);
        tempContext.beginPath();
        tempContext.arc(localX, localY, radius, 0, Math.PI * 2);
        tempContext.fill();

        const ring = tempContext.createRadialGradient(
          localX,
          localY,
          Math.max(0, radius - band),
          localX,
          localY,
          radius + band,
        );
        ring.addColorStop(0, "rgba(255,255,255,0)");
        ring.addColorStop(0.5, rgba(color, 0.18));
        ring.addColorStop(0.66, "rgba(255,255,255,0.68)");
        ring.addColorStop(0.82, rgba(color, 0.58));
        ring.addColorStop(1, "rgba(255,255,255,0)");
        tempContext.fillStyle = ring;
        tempContext.fillRect(0, 0, temp.width, temp.height);
        tempContext.globalCompositeOperation = "destination-in";
        tempContext.drawImage(region.alphaCanvas, 0, 0);
        tempContext.globalCompositeOperation = "source-over";
        wave.drawImage(temp, region.bounds.minX, region.bounds.minY);

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          wave.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
          resolve();
        }
      }

      requestAnimationFrame(frame);
    });
  }

  async function fillAtCanvasPoint(x: number, y: number) {
    const runtime = runtimeRef.current;
    if (!runtime.pdfDoc || runtime.animating) return;
    setEditorBusy(true);
    setStatus("Tracciamento area");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const region = floodFill(x, y);
      if (!region) {
        setStatus("Area non rilevata");
        return;
      }
      const opacity = opacityPercent / 100;
      await animateWave(region, activeUsageOption.color, opacity);
      commitSelection(region, activeUsage, opacity);
    } catch (error) {
      console.error(error);
      setStatus("Selezione non riuscita");
    } finally {
      setEditorBusy(false);
    }
  }

  function removeSelection(id: string) {
    for (const [page, pageSelections] of runtimeRef.current.selectionsByPage.entries()) {
      const index = pageSelections.findIndex((selection) => selection.id === id);
      if (index >= 0) {
        pageSelections.splice(index, 1);
        runtimeRef.current.history = runtimeRef.current.history.filter((selectionId) => selectionId !== id);
        if (page === runtimeRef.current.currentPage) redrawMasks();
        setStatus("Area rimossa");
        bumpRevision();
        return;
      }
    }
  }

  function undoLastSelection() {
    const id = runtimeRef.current.history.pop();
    if (!id) return;
    for (const [page, pageSelections] of runtimeRef.current.selectionsByPage.entries()) {
      const index = pageSelections.findIndex((selection) => selection.id === id);
      if (index >= 0) {
        pageSelections.splice(index, 1);
        if (page === runtimeRef.current.currentPage) redrawMasks();
        setStatus("Annullamento completato");
        bumpRevision();
        return;
      }
    }
    bumpRevision();
  }

  function clearCurrentPage() {
    currentSelections().splice(0);
    runtimeRef.current.history = runtimeRef.current.history.filter((id) => {
      for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
        if (pageSelections.some((selection) => selection.id === id)) return true;
      }
      return false;
    });
    redrawMasks();
    setStatus("Pagina pulita");
    bumpRevision();
  }

  function changeSelectionUsage(id: string, usageId: UsageId) {
    const usage = usageById(usageId);
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      const selection = pageSelections.find((item) => item.id === id);
      if (!selection) continue;
      selection.usageId = usageId;
      selection.color = usage.color;
      selection.bitmap = createTintedCanvas(selection.region, usage.color, selection.opacity);
      redrawMasks();
      bumpRevision();
      return;
    }
  }

  function exportComposite() {
    const { pdfCanvas, maskCanvas } = getCanvases();
    const canvas = document.createElement("canvas");
    canvas.width = pdfCanvas.width;
    canvas.height = pdfCanvas.height;
    const exportCtx = canvas.getContext("2d");
    if (!exportCtx) return;
    exportCtx.drawImage(pdfCanvas, 0, 0);
    exportCtx.drawImage(maskCanvas, 0, 0);
    downloadCanvas(canvas, `${safeFilename(fileName || property.id)}-aree.png`);
  }

  function onStagePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !hasPdf || busy) return;
    const stage = stageRef.current;
    const pdfCanvas = pdfCanvasRef.current;
    if (!stage || !pdfCanvas) return;
    const rect = stage.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * (pdfCanvas.width / rect.width));
    const y = Math.floor((event.clientY - rect.top) * (pdfCanvas.height / rect.height));
    if (x < 0 || y < 0 || x >= pdfCanvas.width || y >= pdfCanvas.height) return;
    void fillAtCanvasPoint(x, y);
  }

  function updateZoom(nextZoom: number) {
    const runtime = runtimeRef.current;
    runtime.zoom = nextZoom / 100;
    setZoomPercent(nextZoom);
    if (runtime.pdfDoc) applyStageSize();
  }

  function invalidateWallMap(nextStatus = "Parametri tracciamento aggiornati") {
    runtimeRef.current.wallMap = null;
    runtimeRef.current.wallKey = "";
    setStatus(nextStatus);
    bumpRevision();
  }

  return (
    <main className="plan-editor">
      <div className="plan-editor-header">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={17} />
          Torna allo studio
        </button>
        <div className="plan-editor-title">
          <div>
            <p className="eyebrow">Editor planimetrie</p>
            <h1>{property.address}</h1>
            <p>
              {study.company} - {property.comune} - categoria {property.categoria}
            </p>
          </div>
          <div className="plan-editor-actions">
            <button className="button secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={17} />
              Carica planimetria
            </button>
            <button className="button secondary" onClick={exportComposite} disabled={!hasPdf}>
              <Download size={17} />
              Esporta PNG
            </button>
            <button className="button primary">
              <FileText size={17} />
              Salva bozza
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(event) => void loadPdfFile(event.target.files?.[0])}
      />

      <section className="plan-editor-grid">
        <aside className="plan-tool-panel">
          <section className="tool-block">
            <div className="tool-block-head">
              <h2>Destinazione d'uso</h2>
              <span style={{ color: activeUsageOption.color }}>{activeUsageOption.shortLabel}</span>
            </div>
            <div className="usage-grid">
              {USAGES.map((usage) => (
                <button
                  key={usage.id}
                  className={`usage-button ${activeUsage === usage.id ? "active" : ""}`}
                  style={{ "--usage-color": usage.color } as CSSProperties}
                  onClick={() => setActiveUsage(usage.id)}
                >
                  <span />
                  {usage.label}
                </button>
              ))}
            </div>
          </section>

          <section className="tool-block">
            <div className="tool-block-head">
              <h2>Scala e foglio</h2>
              <Ruler size={18} />
            </div>
            <label className="scale-field">
              <span>Scala planimetria</span>
              <div>
                <strong>1:</strong>
                <input
                  type="number"
                  min={50}
                  max={5000}
                  step={10}
                  value={scaleDenominator}
                  onChange={(event) => setScaleDenominator(Math.max(1, Number(event.target.value) || 1))}
                />
              </div>
            </label>
            <div className="sheet-toggle" role="group" aria-label="Formato foglio">
              {(["A3", "A4"] as SheetSize[]).map((size) => (
                <button
                  key={size}
                  className={sheetSize === size ? "active" : ""}
                  onClick={() => setSheetSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
            <div className="calibration-card">
              <span>Area reale foglio</span>
              <strong>{formatM2(pageRealAreaM2(sheetSize, scaleDenominator))}</strong>
            </div>
          </section>

          <section className="tool-block">
            <div className="tool-block-head">
              <h2>Planimetria</h2>
              <Layers size={18} />
            </div>
            <div className="sample-buttons">
              {SAMPLE_PLANS.map((plan) => (
                <button
                  key={plan.url}
                  className={fileName === plan.fileName ? "active" : ""}
                  onClick={() => void loadSample(plan.url, plan.fileName)}
                >
                  {plan.label}
                </button>
              ))}
            </div>
            <div className="loaded-doc">
              <FileText size={18} />
              <div>
                <span>PDF aperto</span>
                <strong>{fileName || sample.fileName}</strong>
              </div>
            </div>
          </section>

          <section className="tool-block">
            <div className="tool-block-head">
              <h2>Pagina</h2>
              <span>
                {currentPage || 0}/{pageCount || 0}
              </span>
            </div>
            <div className="page-controls">
              <button
                className="icon-button"
                title="Pagina precedente"
                disabled={!hasPdf || currentPage <= 1 || busy}
                onClick={() => void renderPage(currentPage - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                className="icon-button"
                title="Pagina successiva"
                disabled={!hasPdf || currentPage >= pageCount || busy}
                onClick={() => void renderPage(currentPage + 1)}
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="icon-button"
                title="Annulla ultima area"
                disabled={runtimeRef.current.history.length === 0 || busy}
                onClick={undoLastSelection}
              >
                <RotateCcw size={18} />
              </button>
              <button
                className="icon-button"
                title="Cancella aree pagina"
                disabled={!hasPdf || selections.length === 0 || busy}
                onClick={clearCurrentPage}
              >
                <Trash2 size={18} />
              </button>
            </div>
            <label className="slider-field">
              <span>Zoom {zoomPercent}%</span>
              <input
                type="range"
                min={35}
                max={165}
                value={zoomPercent}
                onChange={(event) => updateZoom(Number(event.target.value))}
              />
            </label>
            <label className="slider-field">
              <span>Opacita maschere {opacityPercent}%</span>
              <input
                type="range"
                min={15}
                max={75}
                value={opacityPercent}
                onChange={(event) => setOpacityPercent(Number(event.target.value))}
              />
            </label>
            <button className="button soft full-width" disabled={!hasPdf} onClick={fitPageToViewport}>
              Adatta alla vista
            </button>
          </section>

          <section className="tool-block">
            <div className="tool-block-head">
              <h2>Smart Selection</h2>
              <MousePointer2 size={18} />
            </div>
            <label className="slider-field">
              <span>Sensibilita linee {threshold}</span>
              <input
                type="range"
                min={170}
                max={252}
                value={threshold}
                onChange={(event) => {
                  setThreshold(Number(event.target.value));
                  invalidateWallMap();
                }}
              />
            </label>
            <label className="slider-field">
              <span>Spessore linee {inflate}</span>
              <input
                type="range"
                min={0}
                max={5}
                value={inflate}
                onChange={(event) => {
                  setInflate(Number(event.target.value));
                  invalidateWallMap();
                }}
              />
            </label>
            <label className="slider-field">
              <span>Chiusura gap {gap}</span>
              <input
                type="range"
                min={0}
                max={18}
                value={gap}
                onChange={(event) => {
                  setGap(Number(event.target.value));
                  invalidateWallMap();
                }}
              />
            </label>
            <label className="slider-field">
              <span>Ponte tratteggi {dash}</span>
              <input
                type="range"
                min={0}
                max={90}
                value={dash}
                onChange={(event) => {
                  setDash(Number(event.target.value));
                  invalidateWallMap();
                }}
              />
            </label>
          </section>
        </aside>

        <section className="plan-canvas-panel">
          <div className="canvas-toolbar">
            <div className="status-pill">
              <span className={busy ? "busy-dot" : ""} />
              {status}
            </div>
            <div>
              <span>{canvasPixels}</span>
              <span>{sheetSize} 1:{scaleDenominator}</span>
            </div>
          </div>
          <div ref={canvasShellRef} className="plan-canvas-shell">
            {!hasPdf && (
              <div className="plan-empty-state">
                <FileText size={30} />
                <strong>Nessuna planimetria aperta</strong>
              </div>
            )}
            <div className="plan-stage-wrap">
              <div
                ref={stageRef}
                className={`plan-stage ${busy ? "is-busy" : ""} ${!hasPdf ? "is-hidden" : ""}`}
                onPointerDown={onStagePointerDown}
              >
                <canvas ref={pdfCanvasRef} />
                <canvas ref={maskCanvasRef} />
                <canvas ref={waveCanvasRef} />
              </div>
            </div>
          </div>
        </section>

        <aside className="areas-panel">
          <section className="selected-property-card">
            <div className="property-symbol">
              {property.categoria.startsWith("D/") ? <Factory size={22} /> : <Home size={22} />}
            </div>
            <div>
              <span>Immobile selezionato</span>
              <strong>{property.address}</strong>
              <small>
                {property.comune} - {property.categoria}
              </small>
            </div>
          </section>

          <section className="area-totals">
            <div>
              <span>Area totale tracciata</span>
              <strong>{formatM2(totals.area)}</strong>
            </div>
            <div>
              <span>Rendita stimata aree</span>
              <strong>{moneyFormatter.format(totals.amount)}</strong>
            </div>
          </section>

          <section className="selected-areas-list">
            <div className="tool-block-head">
              <h2>Aree selezionate</h2>
              <span>{selectedAreas.length}</span>
            </div>
            {selectedAreas.length === 0 ? (
              <div className="areas-empty">
                <MousePointer2 size={22} />
                <strong>Nessuna area</strong>
              </div>
            ) : (
              selectedAreas.map(({ selection, index, usage, area, amount }) => (
                <article key={selection.id} className="area-row">
                  <div className="area-row-head">
                    <span style={{ background: usage.color }} />
                    <strong>Area {index + 1}</strong>
                    <button title="Rimuovi area" onClick={() => removeSelection(selection.id)}>
                      <X size={15} />
                    </button>
                  </div>
                  <select
                    value={selection.usageId}
                    onChange={(event) => changeSelectionUsage(selection.id, event.target.value as UsageId)}
                  >
                    {USAGES.map((usageOption) => (
                      <option key={usageOption.id} value={usageOption.id}>
                        {usageOption.label}
                      </option>
                    ))}
                  </select>
                  <dl>
                    <div>
                      <dt>Area</dt>
                      <dd>{formatM2(area)}</dd>
                    </div>
                    <div>
                      <dt>Coeff.</dt>
                      <dd>{moneyFormatter.format(usage.rate)}/m2</dd>
                    </div>
                    <div>
                      <dt>Stima</dt>
                      <dd>{moneyFormatter.format(amount)}</dd>
                    </div>
                    <div>
                      <dt>Pixel</dt>
                      <dd>{selection.region.count.toLocaleString("it-IT")}</dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </section>

          <section className="usage-breakdown">
            <div className="tool-block-head">
              <h2>Ripartizione</h2>
            </div>
            {USAGES.map((usage) => {
              const usageArea = selectedAreas
                .filter((area) => area.usage.id === usage.id)
                .reduce((sum, area) => sum + area.area, 0);
              return (
                <div key={usage.id} className="usage-breakdown-row">
                  <span style={{ background: usage.color }} />
                  <strong>{usage.shortLabel}</strong>
                  <em>{formatCompactM2(usageArea)}</em>
                </div>
              );
            })}
          </section>
        </aside>
      </section>
    </main>
  );
}
