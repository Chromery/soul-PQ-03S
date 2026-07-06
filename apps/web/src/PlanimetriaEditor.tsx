import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.js?url";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Combine,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Layers,
  MapPin,
  Maximize2,
  MousePointer2,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PencilLine,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { DEFAULT_EDITOR_PREFERENCES, readEditorPreferences } from "./editorPreferences";
import { openEntriesInForMaps, toForMapsEntry } from "./formaps";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";
const ZOOM_MIN = 25;
const ZOOM_MAX = 400;
const ZOOM_BUTTON_STEP = 10;
const ZOOM_KEYBOARD_STEP = 10;
const ZOOM_SLIDER_STEP = 1;
const ZOOM_WHEEL_SENSITIVITY = 0.00045;
const ZOOM_WHEEL_MAX_DELTA = 240;
const SMART_TRACE_DEFAULTS = DEFAULT_EDITOR_PREFERENCES.smartSelection;

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

type SheetSize = "A3" | "A4";
type UsageId =
  | "capannone"
  | "uffici"
  | "tettoie"
  | "sistemazione-esterna"
  | "verde"
  | "lotto"
  | "interrato"
  | "parcheggio-interrato"
  | "parcheggio-esterno"
  | "custom";
type UsageDefinition = {
  id: UsageId;
  label: string;
  shortLabel: string;
  color: string;
  rate: number;
};
type CustomUsagePreset = {
  id: string;
  label: string;
  color: string;
  rate: number;
};
type EditorTool = "select" | "smart" | "polygon" | "ruler";
type LegacyEditorTool = EditorTool | "calibrate";
type SelectionSource = "smart" | "polygon" | "merged" | "copy" | "manual";
type ScaleExtractionStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
type ScaleSource = "DEFAULT" | "AI" | "USER" | "CALIBRATION";
type PageRotation = 0 | 90 | 180 | 270;
type TuningKey = "threshold" | "inflate" | "gap" | "dash";

type CanvasPoint = {
  x: number;
  y: number;
};

type EditorStudy = {
  id: string;
  company: string;
  provincia?: string | null;
};

type EditorPriceList = {
  id: string;
  title: string;
  territoryName: string;
  territoryScope: string;
  year?: number | null;
  rank: number;
  reason: string;
  distanceKm?: number | null;
  downloadUrl: string;
};

type EditorProperty = {
  id: string;
  address: string;
  comune: string;
  provincia?: string | null;
  ubicazione?: string | null;
  foglio?: string | number | null;
  particella?: string | number | null;
  categoria: string;
  currentRendita: number;
  estimatedRendita: number;
  sheetSize?: SheetSize | null;
  scaleDenominator?: number | null;
  scaleSource?: ScaleSource | null;
  aiScaleDenominator?: number | null;
  aiScaleLabel?: string | null;
  aiSheetSize?: SheetSize | null;
  aiScaleConfidence?: number | null;
  aiScaleDetectedAt?: string | null;
  documents: {
    planimetria: string;
    visura: string;
  };
  documentUrls?: {
    planimetria?: string | null;
    visura?: string | null;
  };
  priceLists?: EditorPriceList[];
};

type ScaleExtractionJob = {
  id: string;
  propertyId: string;
  documentId: string | null;
  status: ScaleExtractionStatus;
  model: string;
  sourceFileName: string;
  sourceSha256: string | null;
  scale: {
    denominator: number;
    label: string;
    sheetSize: SheetSize | null;
  } | null;
  confidence: number | null;
  evidence: string | null;
  warnings: string[];
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UploadedPropertyDocument = {
  id: string;
  propertyId: string;
  type: "planimetria" | "visura" | "elaborato";
  fileName: string;
  mimeType: string;
  sha256: string | null;
  sizeBytes: number | null;
  downloadUrl: string;
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
  customUsageId?: string;
  customUsageLabel?: string;
  color: string;
  opacity: number;
  rate: number;
  areaOverrideM2?: number | null;
  amountOverride?: number | null;
  totalPixels: number;
  region: Region;
  bitmap: HTMLCanvasElement;
  source: SelectionSource;
  polygon?: CanvasPoint[];
};

type DocumentSource =
  | { kind: "sample"; fileName: string; url: string }
  | { kind: "remote"; fileName: string; url: string }
  | { kind: "upload"; fileName: string };

type SavedSelection = {
  id: string;
  page: number;
  usageId: UsageId;
  customUsageId?: string;
  customUsageLabel?: string;
  color?: string;
  rate?: number;
  areaOverrideM2?: number | null;
  amountOverride?: number | null;
  opacity: number;
  totalPixels: number;
  source?: SelectionSource;
  polygon?: CanvasPoint[];
  region: {
    bounds: MaskBounds;
    seed: { x: number; y: number };
    count: number;
    width: number;
    height: number;
    alphaDataUrl: string;
  };
};

type SavedCalibration = {
  page: number;
  knownMeters: number;
  scaleDenominator: number;
  start: CanvasPoint;
  end: CanvasPoint;
};

type AiScaleState = {
  denominator: number | null;
  label: string | null;
  sheetSize: SheetSize | null;
  confidence: number | null;
  detectedAt: string | null;
};

type MeasureSegment = {
  page: number;
  start: CanvasPoint;
  end: CanvasPoint;
};

type SavedDraft = {
  version: 1;
  propertyId: string;
  document: DocumentSource | null;
  savedAt: string;
  sheetSize: SheetSize;
  scaleDenominator: number;
  scaleSource?: ScaleSource;
  aiScaleDenominator?: number | null;
  aiScaleLabel?: string | null;
  aiSheetSize?: SheetSize | null;
  aiScaleConfidence?: number | null;
  aiScaleDetectedAt?: string | null;
  pageRotations?: Record<string, PageRotation>;
  activeUsage: UsageId;
  activeCustomUsageId?: string | null;
  customUsages?: CustomUsagePreset[];
  customUsageLabel?: string;
  opacityPercent: number;
  threshold: number;
  inflate: number;
  gap: number;
  dash: number;
  wallInclusionRadius?: number | null;
  activeTool?: LegacyEditorTool;
  calibration?: SavedCalibration | null;
  totalArea?: number;
  totalEstimatedAmount?: number;
  selections: SavedSelection[];
};

type DragSnapshot = {
  id: string;
  bounds: MaskBounds;
  seed: CanvasPoint;
  polygon?: CanvasPoint[];
};

type DragState = {
  start: CanvasPoint;
  snapshots: DragSnapshot[];
  historyRecorded: boolean;
};

type MarqueeState = {
  start: CanvasPoint;
  current: CanvasPoint;
};

type MarqueeDragState = {
  start: CanvasPoint;
  append: boolean;
  initialSelectedIds: string[];
  initialRulerSelected: boolean;
};

type SegmentDragState = {
  mode: "body" | "start" | "end";
  start: CanvasPoint;
  initialSegment: MeasureSegment;
  historyRecorded: boolean;
};

type PolygonEditDragState = {
  selectionId: string;
  vertexIndex: number;
  historyRecorded: boolean;
};

type PolygonInsertTarget = {
  selectionId: string;
  edgeIndex: number;
  point: CanvasPoint;
};

type SelectedPolygonVertex = {
  selectionId: string;
  vertexIndex: number;
};

type ClipboardSelection = {
  usageId: UsageId;
  customUsageId?: string;
  customUsageLabel?: string;
  color: string;
  opacity: number;
  rate: number;
  areaOverrideM2?: number | null;
  amountOverride?: number | null;
  totalPixels: number;
  source: SelectionSource;
  polygon?: CanvasPoint[];
  region: Region;
};

type Runtime = {
  pdfDoc: PdfDocument | null;
  pdfData: ArrayBuffer | null;
  fileName: string;
  currentPage: number;
  pageCount: number;
  renderScale: number;
  zoom: number;
  pageRotations: Map<number, PageRotation>;
  selectionsByPage: Map<number, AreaSelection[]>;
  history: string[];
  undoStack: EditorSnapshot[];
  redoStack: EditorSnapshot[];
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

type EditorSnapshot = {
  selectionsByPage: Map<number, AreaSelection[]>;
  selectedIds: string[];
  history: string[];
  calibration: SavedCalibration | null;
  rulerSegment: MeasureSegment | null;
  scaleDenominator: number;
  sheetSize: SheetSize;
  scaleSource: ScaleSource;
  aiScale: AiScaleState;
  pageRotations: Map<number, PageRotation>;
  activeUsage: UsageId;
  activeCustomUsageId: string | null;
  customUsages: CustomUsagePreset[];
  customUsageLabel: string;
  opacityPercent: number;
  threshold: number;
  inflate: number;
  gap: number;
  dash: number;
  wallInclusionRadius: number | null;
  knownSegmentMeters: number;
};

type AreaTuningTrial = {
  id: string;
  createdAt: string;
  threshold: number;
  inflate: number;
  gap: number;
  dash: number;
  wallInclusionRadius: number | null;
  resolvedWallInclusionRadius: number;
};

type ToolSectionId = "usage" | "planimetry" | "smart";
type RightPanelSectionId = "totals" | "areas" | "breakdown";

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
  onDirtyChange?: (dirty: boolean) => void;
  onDraftSaved?: (propertyId: string, totalEstimatedAmount: number) => void;
  onDocumentSaved?: (propertyId: string, fileName: string, downloadUrl: string) => void;
};

const USAGES: UsageDefinition[] = [
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
  { id: "interrato", label: "Interrato", shortLabel: "Interrato", color: "#334155", rate: 4.5 },
  {
    id: "parcheggio-interrato",
    label: "Parcheggio interrato",
    shortLabel: "P. interrato",
    color: "#475569",
    rate: 3,
  },
  {
    id: "parcheggio-esterno",
    label: "Parcheggio esterno",
    shortLabel: "P. esterno",
    color: "#0284c7",
    rate: 1.2,
  },
  { id: "custom", label: "Custom", shortLabel: "Custom", color: "#0891b2", rate: 1 },
];

const CUSTOM_USAGE_ID: UsageId = "custom";
const FIXED_USAGES = USAGES.filter((usage) => usage.id !== CUSTOM_USAGE_ID);
const CUSTOM_USAGE_COLORS = ["#0891b2", "#0e7490", "#0f766e", "#2563eb", "#9333ea", "#be123c", "#ca8a04"];

const DRAFT_KEY_PREFIX = "soul-planimetria-draft:";
const AREA_TUNING_TRIALS_KEY_PREFIX = "soul-area-tuning-trials:";
const PANEL_STORAGE_KEYS = {
  left: "soul-editor-left-panel-open",
  right: "soul-editor-right-panel-open",
};

const SHEET_SIZES: Record<SheetSize, { widthMm: number; heightMm: number }> = {
  A3: { widthMm: 420, heightMm: 297 },
  A4: { widthMm: 297, heightMm: 210 },
};

const TOOL_OPTIONS: Array<{
  id: EditorTool;
  label: string;
  description: string;
  shortcut: string;
  icon: ReactNode;
}> = [
  {
    id: "select",
    label: "Seleziona",
    description: "Sposta, copia e unisci aree",
    shortcut: "V",
    icon: <Move size={17} />,
  },
  {
    id: "smart",
    label: "Smart selection",
    description: "Clicca dentro un'area chiusa",
    shortcut: "S",
    icon: <MousePointer2 size={17} />,
  },
  {
    id: "polygon",
    label: "Poligono",
    description: "Disegno manuale per vertici",
    shortcut: "P",
    icon: <PencilLine size={17} />,
  },
  {
    id: "ruler",
    label: "Righello",
    description: "Misura distanza tra due punti",
    shortcut: "R",
    icon: <Ruler size={17} />,
  },
];

const SHORTCUTS = {
  undo: "Ctrl/Cmd+Z",
  redo: "Ctrl/Cmd+Shift+Z o Ctrl/Cmd+Y",
  copy: "Ctrl/Cmd+C",
  paste: "Ctrl/Cmd+V",
  delete: "Backspace/Delete",
  select: "V",
  smart: "S",
  polygon: "P",
  ruler: "R",
  focus: "F",
  zoomIn: "Maiusc+Freccia su",
  zoomOut: "Maiusc+Freccia giu",
  wheelZoom: "Alt/Option+rotella",
  rotateLeft: "Maiusc+Freccia sinistra",
  rotateRight: "Maiusc+Freccia destra",
};

function withShortcut(label: string, shortcut?: string) {
  return shortcut ? `${label} (${shortcut})` : label;
}

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
    pdfData: null,
    fileName: "",
    currentPage: 0,
    pageCount: 0,
    renderScale: 2,
    zoom: 1,
    pageRotations: new Map(),
    selectionsByPage: new Map(),
    history: [],
    undoStack: [],
    redoStack: [],
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

function shortCustomUsageLabel(label: string) {
  return label.length > 18 ? `${label.slice(0, 17)}...` : label;
}

function normalizeCustomUsageLabel(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
}

function isHexColor(value?: string) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "");
}

function stableStringHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function createCustomUsageId(label: string, index = 0) {
  const slug =
    normalizeCustomUsageLabel(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "area";
  return `custom-${slug}-${stableStringHash(`${label}:${index}`)}`;
}

function nextCustomUsageLabel(presets: CustomUsagePreset[], base = "Custom") {
  const normalizedBase = normalizeCustomUsageLabel(base) || "Custom";
  const usedLabels = new Set(presets.map((preset) => preset.label.toLowerCase()));
  if (!usedLabels.has(normalizedBase.toLowerCase())) return normalizedBase;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${normalizedBase} ${index}`;
    if (!usedLabels.has(candidate.toLowerCase())) return candidate;
  }
  return `${normalizedBase} ${Date.now()}`;
}

function normalizeCustomUsagePreset(
  value: Partial<CustomUsagePreset> | undefined,
  fallbackIndex: number,
): CustomUsagePreset | null {
  const label = normalizeCustomUsageLabel(value?.label);
  if (!label) return null;
  const color = isHexColor(value?.color)
    ? value!.color!.toLowerCase()
    : CUSTOM_USAGE_COLORS[fallbackIndex % CUSTOM_USAGE_COLORS.length];
  const rate = typeof value?.rate === "number" && Number.isFinite(value.rate) ? value.rate : usageById(CUSTOM_USAGE_ID).rate;
  return {
    id: value?.id || createCustomUsageId(label, fallbackIndex),
    label,
    color,
    rate,
  };
}

function addCustomUsagePresetUnique(presets: CustomUsagePreset[], preset: CustomUsagePreset | null) {
  if (!preset) return;
  const hasSameId = presets.some((item) => item.id === preset.id);
  const hasSameLabel = presets.some((item) => item.label.toLowerCase() === preset.label.toLowerCase());
  if (!hasSameId && !hasSameLabel) presets.push(preset);
}

function customUsagesFromDraft(draft: Pick<SavedDraft, "customUsages" | "customUsageLabel" | "selections">) {
  const presets: CustomUsagePreset[] = [];
  draft.customUsages?.forEach((preset, index) => {
    addCustomUsagePresetUnique(presets, normalizeCustomUsagePreset(preset, index));
  });
  draft.selections.forEach((selection, index) => {
    if (selection.usageId !== CUSTOM_USAGE_ID) return;
    addCustomUsagePresetUnique(
      presets,
      normalizeCustomUsagePreset(
        {
          id: selection.customUsageId,
          label: selection.customUsageLabel,
          color: selection.color,
          rate: selection.rate,
        },
        presets.length + index,
      ),
    );
  });
  addCustomUsagePresetUnique(
    presets,
    normalizeCustomUsagePreset({ label: draft.customUsageLabel }, presets.length),
  );
  return presets;
}

function customUsageByIdOrLabel(
  presets: CustomUsagePreset[],
  customUsageId?: string | null,
  customUsageLabel?: string,
) {
  if (customUsageId) {
    const byId = presets.find((preset) => preset.id === customUsageId);
    if (byId) return byId;
  }
  const label = normalizeCustomUsageLabel(customUsageLabel);
  if (!label) return null;
  return presets.find((preset) => preset.label.toLowerCase() === label.toLowerCase()) ?? null;
}

function usageFromCustomPreset(preset: CustomUsagePreset | null | undefined, fallbackLabel?: string): UsageDefinition {
  const customUsage = usageById(CUSTOM_USAGE_ID);
  const label = normalizeCustomUsageLabel(preset?.label ?? fallbackLabel) || customUsage.label;
  return {
    ...customUsage,
    label,
    shortLabel: shortCustomUsageLabel(label),
    color: preset?.color ?? customUsage.color,
    rate: preset?.rate ?? customUsage.rate,
  };
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

function orientedSheetSize(sheetSize: SheetSize, canvasWidth: number, canvasHeight: number) {
  const sheet = SHEET_SIZES[sheetSize];
  const pdfIsLandscape = canvasWidth >= canvasHeight;
  const sheetIsLandscape = sheet.widthMm >= sheet.heightMm;
  if (pdfIsLandscape === sheetIsLandscape) return sheet;
  return { widthMm: sheet.heightMm, heightMm: sheet.widthMm };
}

function distance(a: CanvasPoint, b: CanvasPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function parseNumberInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEditorTool(tool?: LegacyEditorTool): EditorTool {
  return tool === "calibrate" ? "ruler" : tool ?? "smart";
}

function translatePoint(point: CanvasPoint, dx: number, dy: number): CanvasPoint {
  return { x: point.x + dx, y: point.y + dy };
}

function cloneCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Contesto canvas non disponibile");
  context.drawImage(source, 0, 0);
  return canvas;
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

function effectiveSelectionAreaM2(selection: Pick<AreaSelection, "areaOverrideM2">, calculatedArea: number) {
  return typeof selection.areaOverrideM2 === "number" && Number.isFinite(selection.areaOverrideM2)
    ? selection.areaOverrideM2
    : calculatedArea;
}

function effectiveSelectionAmount(selection: Pick<AreaSelection, "amountOverride">, calculatedAmount: number) {
  return typeof selection.amountOverride === "number" && Number.isFinite(selection.amountOverride)
    ? selection.amountOverride
    : calculatedAmount;
}

function propertyLocation(property: EditorProperty) {
  const comune = property.comune ? `${property.comune}${property.provincia ? ` (${property.provincia})` : ""}` : "";
  return property.ubicazione || [property.address, comune].filter(Boolean).join(", ") || property.id;
}

function googleMapsUrl(property: EditorProperty) {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", propertyLocation(property));
  return url.toString();
}

function googleEarthUrl(property: EditorProperty) {
  return `https://earth.google.com/web/search/${encodeURIComponent(propertyLocation(property))}`;
}

function draftKey(propertyId: string) {
  return `${DRAFT_KEY_PREFIX}${propertyId}`;
}

function areaTuningTrialsKey(propertyId: string) {
  return `${AREA_TUNING_TRIALS_KEY_PREFIX}${propertyId}`;
}

function autoWallInclusionRadius(inflate: number, dash: number) {
  return Math.max(4, Math.min(8, inflate + Math.ceil(dash / 12)));
}

function normalizeWallInclusionRadius(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(8, Math.round(parsed)));
}

function isAreaTuningTrial(value: unknown): value is AreaTuningTrial {
  if (!value || typeof value !== "object") return false;
  const item = value as AreaTuningTrial;
  return (
    typeof item.id === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.threshold === "number" &&
    typeof item.inflate === "number" &&
    typeof item.gap === "number" &&
    typeof item.dash === "number" &&
    typeof item.resolvedWallInclusionRadius === "number"
  );
}

function readAreaTuningTrials(propertyId: string) {
  try {
    const serialized = window.localStorage.getItem(areaTuningTrialsKey(propertyId));
    if (!serialized) return [];
    const parsed = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.filter(isAreaTuningTrial).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveAreaTuningTrials(propertyId: string, trials: AreaTuningTrial[]) {
  try {
    window.localStorage.setItem(areaTuningTrialsKey(propertyId), JSON.stringify(trials.slice(0, 8)));
  } catch {
    // Trial history is only a local tuning aid.
  }
}

function readSavedDraft(propertyId: string) {
  try {
    const serialized = window.localStorage.getItem(draftKey(propertyId));
    if (!serialized) return null;
    const draft = JSON.parse(serialized) as SavedDraft;
    return draft.version === 1 && draft.propertyId === propertyId ? draft : null;
  } catch {
    return null;
  }
}

function readPanelState(key: string) {
  return window.localStorage.getItem(key) !== "false";
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function emptyAiScale(): AiScaleState {
  return {
    denominator: null,
    label: null,
    sheetSize: null,
    confidence: null,
    detectedAt: null,
  };
}

function isValidScaleDenominator(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 20 && value <= 20000;
}

function normalizeSheetSize(value: unknown): SheetSize | null {
  return value === "A3" || value === "A4" ? value : null;
}

function normalizeScaleSource(value: unknown, fallback: ScaleSource): ScaleSource {
  return value === "DEFAULT" || value === "AI" || value === "USER" || value === "CALIBRATION"
    ? value
    : fallback;
}

function normalizePageRotation(value: number): PageRotation {
  const normalized = ((value % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

function pageRotationFromValue(value: unknown): PageRotation {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return normalizePageRotation(value);
}

function parsePageRotations(value: unknown) {
  const rotations = new Map<number, PageRotation>();
  if (!value || typeof value !== "object" || Array.isArray(value)) return rotations;
  Object.entries(value as Record<string, unknown>).forEach(([page, rotation]) => {
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return;
    const normalized = pageRotationFromValue(rotation);
    if (normalized !== 0) rotations.set(pageNumber, normalized);
  });
  return rotations;
}

function serializePageRotations(rotations: Map<number, PageRotation>) {
  const serialized: Record<string, PageRotation> = {};
  rotations.forEach((rotation, page) => {
    if (rotation !== 0) serialized[String(page)] = rotation;
  });
  return Object.keys(serialized).length > 0 ? serialized : undefined;
}

function isUserScaleSource(value: ScaleSource) {
  return value === "USER" || value === "CALIBRATION";
}

function aiScaleFromDraft(draft: SavedDraft): AiScaleState {
  return {
    denominator: isValidScaleDenominator(draft.aiScaleDenominator) ? draft.aiScaleDenominator : null,
    label: typeof draft.aiScaleLabel === "string" ? draft.aiScaleLabel : null,
    sheetSize: normalizeSheetSize(draft.aiSheetSize),
    confidence:
      typeof draft.aiScaleConfidence === "number" && Number.isFinite(draft.aiScaleConfidence)
        ? draft.aiScaleConfidence
        : null,
    detectedAt: typeof draft.aiScaleDetectedAt === "string" ? draft.aiScaleDetectedAt : null,
  };
}

function aiScaleFromProperty(property: EditorProperty): AiScaleState {
  return {
    denominator: isValidScaleDenominator(property.aiScaleDenominator) ? property.aiScaleDenominator : null,
    label: typeof property.aiScaleLabel === "string" ? property.aiScaleLabel : null,
    sheetSize: normalizeSheetSize(property.aiSheetSize),
    confidence:
      typeof property.aiScaleConfidence === "number" && Number.isFinite(property.aiScaleConfidence)
        ? property.aiScaleConfidence
        : null,
    detectedAt: typeof property.aiScaleDetectedAt === "string" ? property.aiScaleDetectedAt : null,
  };
}

export default function PlanimetriaEditor({
  study,
  property,
  onBack,
  onDirtyChange,
  onDraftSaved,
  onDocumentSaved,
}: PlanimetriaEditorProps) {
  const editorRootRef = useRef<HTMLElement | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasShellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runtimeRef = useRef<Runtime>(createRuntime());
  const pendingDraftRef = useRef<SavedDraft | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const marqueeDragRef = useRef<MarqueeDragState | null>(null);
  const segmentDragRef = useRef<SegmentDragState | null>(null);
  const polygonEditDragRef = useRef<PolygonEditDragState | null>(null);
  const rulerDragRef = useRef<CanvasPoint | null>(null);
  const clipboardRef = useRef<ClipboardSelection[]>([]);
  const outlinePathCacheRef = useRef<WeakMap<HTMLCanvasElement, CanvasPoint[][]>>(new WeakMap());

  const [status, setStatus] = useState("Caricamento planimetria");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [canvasPixels, setCanvasPixels] = useState("0 x 0");
  const [activeUsage, setActiveUsage] = useState<UsageId>("capannone");
  const [activeCustomUsageId, setActiveCustomUsageId] = useState<string | null>(null);
  const [customUsages, setCustomUsages] = useState<CustomUsagePreset[]>([]);
  const [customUsageLabel, setCustomUsageLabel] = useState("");
  const [scaleDenominator, setScaleDenominator] = useState(() => readEditorPreferences().scale.denominator);
  const [sheetSize, setSheetSize] = useState<SheetSize>(() => readEditorPreferences().scale.sheetSize);
  const [scaleSource, setScaleSource] = useState<ScaleSource>("DEFAULT");
  const [aiScale, setAiScale] = useState<AiScaleState>(() => emptyAiScale());
  const [activeTool, setActiveTool] = useState<EditorTool>("smart");
  const [scaleInputValue, setScaleInputValue] = useState("500");
  const [knownSegmentMeters, setKnownSegmentMeters] = useState(50);
  const [knownSegmentInputValue, setKnownSegmentInputValue] = useState("50");
  const [calibration, setCalibration] = useState<SavedCalibration | null>(null);
  const [rulerSegment, setRulerSegment] = useState<MeasureSegment | null>(null);
  const [rulerSegmentSelected, setRulerSegmentSelected] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [opacityPercent, setOpacityPercent] = useState(44);
  const [threshold, setThreshold] = useState(SMART_TRACE_DEFAULTS.threshold);
  const [inflate, setInflate] = useState(SMART_TRACE_DEFAULTS.inflate);
  const [gap, setGap] = useState(SMART_TRACE_DEFAULTS.gap);
  const [dash, setDash] = useState(SMART_TRACE_DEFAULTS.dash);
  const [wallInclusionRadius, setWallInclusionRadius] = useState<number | null>(
    SMART_TRACE_DEFAULTS.wallInclusionRadius,
  );
  const [areaCalibrationOpen, setAreaCalibrationOpen] = useState(false);
  const [areaTuningTrials, setAreaTuningTrials] = useState<AreaTuningTrial[]>([]);
  const [documentSource, setDocumentSource] = useState<DocumentSource | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [leftPanelOpen, setLeftPanelOpen] = useState(() => readPanelState(PANEL_STORAGE_KEYS.left));
  const [rightPanelOpen, setRightPanelOpen] = useState(() => readPanelState(PANEL_STORAGE_KEYS.right));
  const [priceListDropdownOpen, setPriceListDropdownOpen] = useState(true);
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [scaleModalSheetSize, setScaleModalSheetSize] = useState<SheetSize>(() => readEditorPreferences().scale.sheetSize);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const [clearPageConfirmOpen, setClearPageConfirmOpen] = useState(false);
  const [opacityDockOpen, setOpacityDockOpen] = useState(false);
  const [areaTableCollapsed, setAreaTableCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<ToolSectionId, boolean>>({
    usage: false,
    planimetry: false,
    smart: false,
  });
  const [collapsedRightSections, setCollapsedRightSections] = useState<Record<RightPanelSectionId, boolean>>({
    totals: false,
    areas: false,
    breakdown: false,
  });
  const [collapsedAreaIds, setCollapsedAreaIds] = useState<string[]>([]);
  const [selectedPolygonVertex, setSelectedPolygonVertex] = useState<SelectedPolygonVertex | null>(null);
  const [hoverPolygonInsert, setHoverPolygonInsert] = useState<PolygonInsertTarget | null>(null);
  const [selectedSelectionIds, setSelectedSelectionIds] = useState<string[]>([]);
  const [marqueeDraft, setMarqueeDraft] = useState<MarqueeState | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<CanvasPoint[]>([]);
  const [pointerPreview, setPointerPreview] = useState<CanvasPoint | null>(null);
  const [rulerDraft, setRulerDraft] = useState<MeasureSegment | null>(null);
  const [clipboardCount, setClipboardCount] = useState(0);
  const [scaleExtractionJob, setScaleExtractionJob] = useState<ScaleExtractionJob | null>(null);
  const [scaleExtractionBusy, setScaleExtractionBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const linkedRemotePlan = useMemo(
    () =>
      property.documentUrls?.planimetria
        ? {
            fileName: property.documents.planimetria || "Planimetria importata.pdf",
            url: property.documentUrls.planimetria,
          }
        : null,
    [property.documentUrls?.planimetria, property.documents.planimetria],
  );
  const forMapsEntry = useMemo(
    () =>
      toForMapsEntry({
        ...property,
        provincia: property.provincia || study.provincia,
      }),
    [property, study.provincia],
  );
  const activeCustomUsage = customUsageByIdOrLabel(customUsages, activeCustomUsageId, customUsageLabel);
  const activeUsageOption =
    activeUsage === CUSTOM_USAGE_ID
      ? usageFromCustomPreset(activeCustomUsage, customUsageLabel)
      : usageById(activeUsage);
  const autoWallRadius = autoWallInclusionRadius(inflate, dash);
  const resolvedWallInclusionRadius = wallInclusionRadius ?? autoWallRadius;
  const hasPdf = pageCount > 0;
  const allSelections = Array.from(runtimeRef.current.selectionsByPage.values()).flat();
  const selections = hasPdf ? currentSelections() : [];
  const selectedSelections = allSelections.filter((selection) =>
    selectedSelectionIds.includes(selection.id),
  );
  const selectedCurrentPageSelections = selections.filter((selection) =>
    selectedSelectionIds.includes(selection.id),
  );
  const canUndo = runtimeRef.current.undoStack.length > 0;
  const canRedo = runtimeRef.current.redoStack.length > 0;
  const canDeleteSelectedObject = selectedSelectionIds.length > 0 || rulerSegmentSelected || Boolean(selectedPolygonVertex);
  const hasCurrentPageAreas = selections.length > 0;
  const canSaveDraft = Boolean(documentSource || allSelections.length > 0);
  const currentPageRotation = currentPage ? runtimeRef.current.pageRotations.get(currentPage) ?? 0 : 0;

  const selectedAreas = useMemo(
    () =>
      allSelections.map((selection, index) => {
        const selectionCustomUsage = customUsageByIdOrLabel(
          customUsages,
          selection.customUsageId,
          selection.customUsageLabel,
        );
        const usage = {
          ...(selection.usageId === CUSTOM_USAGE_ID
            ? usageFromCustomPreset(selectionCustomUsage, selection.customUsageLabel)
            : usageById(selection.usageId)),
          color: selection.color,
        };
        const calculatedArea = areaFromPixels(
          selection.region.count,
          selection.totalPixels,
          sheetSize,
          scaleDenominator,
        );
        const area = effectiveSelectionAreaM2(selection, calculatedArea);
        const calculatedAmount = area * selection.rate;
        const amount = effectiveSelectionAmount(selection, calculatedAmount);
        return {
          selection,
          index,
          usage,
          area,
          calculatedArea,
          amount,
          calculatedAmount,
          areaOverridden: typeof selection.areaOverrideM2 === "number" && Number.isFinite(selection.areaOverrideM2),
          amountOverridden: typeof selection.amountOverride === "number" && Number.isFinite(selection.amountOverride),
        };
      }),
    [allSelections, customUsages, scaleDenominator, sheetSize, revision],
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

  const usageBreakdown = useMemo(() => {
    const byUsage = new Map<string, { usage: UsageDefinition; area: number }>();
    selectedAreas.forEach((area) => {
      const key = `${area.usage.id}:${area.selection.customUsageLabel ?? ""}`;
      const current = byUsage.get(key);
      if (current) current.area += area.area;
      else byUsage.set(key, { usage: area.usage, area: area.area });
    });
    return Array.from(byUsage.values()).filter((item) => item.area > 0);
  }, [selectedAreas]);
  const rulerDistanceMeters = rulerSegment ? segmentMetersFromScale(rulerSegment) : 0;
  const allAreasCollapsed = selectedAreas.length > 0 && collapsedAreaIds.length === selectedAreas.length;
  const scaleModalPreviewScale = Math.min(
    20000,
    Math.max(20, Math.round(parseNumberInput(scaleInputValue) ?? scaleDenominator)),
  );
  const scaleExtractionLabel =
    scaleExtractionJob?.status === "SUCCEEDED" && scaleExtractionJob.scale
      ? `Scala AI ${scaleExtractionJob.scale.label}`
      : scaleExtractionJob?.status === "SUCCEEDED"
        ? "Scala AI non rilevata"
        : scaleExtractionJob?.status === "FAILED"
          ? "Scala AI non disponibile"
          : scaleExtractionBusy || scaleExtractionJob?.status === "PENDING" || scaleExtractionJob?.status === "RUNNING"
            ? "Analisi scala AI"
            : null;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    window.localStorage.setItem(PANEL_STORAGE_KEYS.left, String(leftPanelOpen));
    window.localStorage.setItem(PANEL_STORAGE_KEYS.right, String(rightPanelOpen));
  }, [leftPanelOpen, rightPanelOpen]);

  useEffect(() => {
    setPriceListDropdownOpen(true);
  }, [property.id]);

  useEffect(() => {
    setAreaTuningTrials(readAreaTuningTrials(property.id));
  }, [property.id]);

  useEffect(() => {
    setScaleInputValue(String(scaleDenominator));
  }, [scaleDenominator]);

  useEffect(() => {
    setKnownSegmentInputValue(String(knownSegmentMeters));
  }, [knownSegmentMeters]);

  useEffect(() => {
    if (hasPdf) redrawMasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTool,
    selectedSelectionIds,
    marqueeDraft,
    polygonDraft,
    pointerPreview,
    calibration,
    rulerDraft,
    rulerSegment,
    rulerSegmentSelected,
    selectedPolygonVertex,
    hoverPolygonInsert,
    revision,
    hasPdf,
  ]);

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) setFocusMode(false);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!hasPdf) return;
    window.requestAnimationFrame(() => applyStageSize());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode, leftPanelOpen, rightPanelOpen, hasPdf]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditable = Boolean(target?.closest("input, textarea, select"));
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && (key === "z" || key === "y")) {
        event.preventDefault();
        if (key === "z" && event.shiftKey) redoSelectionEdit();
        else if (key === "z") undoSelectionEdit();
        else redoSelectionEdit();
        return;
      }

      if (isEditable) return;

      if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          updateZoom(zoomPercent + ZOOM_KEYBOARD_STEP, getVisibleStageCenterAnchor());
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          updateZoom(zoomPercent - ZOOM_KEYBOARD_STEP, getVisibleStageCenterAnchor());
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          void rotateCurrentPage(-90);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          void rotateCurrentPage(90);
          return;
        }
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        if (selectedPolygonVertex) deleteSelectedPolygonVertex();
        else deleteSelectedObjects();
        return;
      }

      if (!modifier) {
        const usageShortcutIndex = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
        if (
          usageShortcutIndex >= 0 &&
          usageShortcutIndex < FIXED_USAGES.length &&
          (activeTool === "select" || activeTool === "smart" || activeTool === "polygon")
        ) {
          event.preventDefault();
          const usage = FIXED_USAGES[usageShortcutIndex];
          changeActiveUsage(usage.id);
          return;
        }
        if (key === "v") selectTool("select");
        if (key === "s") selectTool("smart");
        if (key === "p") selectTool("polygon");
        if (key === "r") selectTool("ruler");
        if (key === "f") void toggleFocusMode();
        if (event.key === "Escape") {
          setPolygonDraft([]);
          setPointerPreview(null);
          setSelectedPolygonVertex(null);
          setHoverPolygonInsert(null);
          setDeleteMenuOpen(false);
          setOpacityDockOpen(false);
        }
        return;
      }
      if (key === "c") {
        event.preventDefault();
        copySelectedSelections();
      }
      if (key === "v") {
        event.preventDefault();
        pasteCopiedSelections();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedSelectionIds,
    selectedPolygonVertex,
    clipboardCount,
    currentPage,
    hasPdf,
    revision,
    focusMode,
    activeTool,
    activeUsage,
    activeCustomUsageId,
    customUsages,
    customUsageLabel,
    zoomPercent,
    busy,
  ]);

  useEffect(() => {
    const shell = canvasShellRef.current;
    if (!shell) return;
    shell.addEventListener("wheel", handleCanvasWheel, { passive: false });
    return () => shell.removeEventListener("wheel", handleCanvasWheel);
  });

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const abortController = new AbortController();
    let disposed = false;

    runtimeRef.current = createRuntime();
    setCurrentPage(0);
    setPageCount(0);
    setFileName("");
    setCanvasPixels("0 x 0");
    setDocumentSource(null);
    setActiveTool("smart");
    setScaleDenominator(500);
    setSheetSize("A3");
    setScaleSource("DEFAULT");
    setAiScale(emptyAiScale());
    setCalibration(null);
    setRulerSegment(null);
    setRulerSegmentSelected(false);
    setRulerDraft(null);
    setSelectedSelectionIds([]);
    setMarqueeDraft(null);
    setPolygonDraft([]);
    setPointerPreview(null);
    setActiveCustomUsageId(null);
    setCustomUsages([]);
    setCustomUsageLabel("");
    dragStateRef.current = null;
    marqueeDragRef.current = null;
    segmentDragRef.current = null;
    polygonEditDragRef.current = null;
    rulerDragRef.current = null;
    setSelectedPolygonVertex(null);
    setHoverPolygonInsert(null);
    setCollapsedAreaIds([]);
    setScaleExtractionJob(null);
    setScaleExtractionBusy(false);
    setThreshold(SMART_TRACE_DEFAULTS.threshold);
    setInflate(SMART_TRACE_DEFAULTS.inflate);
    setGap(SMART_TRACE_DEFAULTS.gap);
    setDash(SMART_TRACE_DEFAULTS.dash);
    setWallInclusionRadius(SMART_TRACE_DEFAULTS.wallInclusionRadius);
    setDirty(false);
    setSavedAt("");
    setRevision((value) => value + 1);
    setStatus("Recupero bozza e planimetria");

    function openInitialDocument(draft: SavedDraft | null) {
      pendingDraftRef.current = draft;
      setDocumentSource(draft?.document ?? null);
      setSavedAt(draft?.savedAt ?? "");

      if (!draft) {
        applyPropertyScaleFallback();
        if (linkedRemotePlan) {
          void loadRemotePlan(linkedRemotePlan.url, linkedRemotePlan.fileName, undefined, true);
        } else {
          setStatus("Carica una planimetria o apri il documento ERP");
        }
        return;
      }

      setSheetSize(draft.sheetSize);
      setScaleDenominator(draft.scaleDenominator);
      setScaleSource(normalizeScaleSource(draft.scaleSource, "DEFAULT"));
      const draftAiScale = aiScaleFromDraft(draft);
      const draftCustomUsages = customUsagesFromDraft(draft);
      const draftActiveCustomUsage = customUsageByIdOrLabel(
        draftCustomUsages,
        draft.activeCustomUsageId,
        draft.customUsageLabel,
      );
      setAiScale(draftAiScale.denominator ? draftAiScale : aiScaleFromProperty(property));
      setActiveUsage(draft.activeUsage);
      setCustomUsages(draftCustomUsages);
      setActiveCustomUsageId(draftActiveCustomUsage?.id ?? null);
      setCustomUsageLabel(draftActiveCustomUsage?.label ?? draft.customUsageLabel ?? "");
      setOpacityPercent(draft.opacityPercent);
      setThreshold(draft.threshold);
      setInflate(draft.inflate);
      setGap(draft.gap);
      setDash(draft.dash);
      setWallInclusionRadius(
        Object.prototype.hasOwnProperty.call(draft, "wallInclusionRadius")
          ? normalizeWallInclusionRadius(draft.wallInclusionRadius)
          : SMART_TRACE_DEFAULTS.wallInclusionRadius,
      );
      setActiveTool(normalizeEditorTool(draft.activeTool));
      setCalibration(draft.calibration ?? null);
      setKnownSegmentMeters(draft.calibration?.knownMeters ?? 50);
      setRulerSegment(
        draft.calibration
          ? { page: draft.calibration.page, start: draft.calibration.start, end: draft.calibration.end }
          : null,
      );
      if (!draft.document) {
        void restoreDraftSelections(draft);
        setStatus("Bozza manuale ripristinata");
      } else if (draft.document.kind === "sample") {
        if (linkedRemotePlan) {
          void loadRemotePlan(linkedRemotePlan.url, linkedRemotePlan.fileName, draft, true);
        } else {
          setDocumentSource(null);
          void restoreDraftSelections(draft);
          setStatus("Bozza salvata con documento mock rimosso: carica la planimetria ERP");
        }
      } else if (draft.document.kind === "remote") {
        void loadRemotePlan(draft.document.url, draft.document.fileName, draft, true);
      } else {
        setStatus(`Bozza salvata: ricarica ${draft.document.fileName}`);
      }
    }

    async function loadInitialDocument() {
      let draft: SavedDraft | null = null;
      try {
        const response = await fetch(
          `${API_BASE_URL}/properties/${encodeURIComponent(property.id)}/analysis-draft`,
          { signal: abortController.signal },
        );
        if (response.ok) {
          const storedDraft = (await response.json()) as SavedDraft | null;
          if (storedDraft?.version === 1 && storedDraft.propertyId === property.id) {
            draft = storedDraft;
            try {
              window.localStorage.setItem(draftKey(property.id), JSON.stringify(storedDraft));
            } catch {
              // Server persistence remains available when the browser draft quota is exceeded.
            }
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }

      if (!draft) draft = readSavedDraft(property.id);
      if (!disposed) openInitialDocument(draft);
    }

    void loadInitialDocument();

    return () => {
      disposed = true;
      abortController.abort();
      const renderTask = runtimeRef.current.renderTask;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Render cancellation is best effort.
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, linkedRemotePlan?.url, linkedRemotePlan?.fileName]);

  function markDirty() {
    setDirty(true);
  }

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

  function applyPropertyScaleFallback() {
    const propertyAiScale = aiScaleFromProperty(property);
    setAiScale(propertyAiScale);

    const propertyScale = isValidScaleDenominator(property.scaleDenominator)
      ? property.scaleDenominator
      : propertyAiScale.denominator;
    const propertySheetSize = normalizeSheetSize(property.sheetSize) ?? propertyAiScale.sheetSize ?? "A3";

    if (propertyScale) {
      setScaleDenominator(propertyScale);
      setScaleInputValue(String(propertyScale));
      setScaleSource(
        isValidScaleDenominator(property.scaleDenominator)
          ? normalizeScaleSource(property.scaleSource, propertyAiScale.denominator ? "AI" : "DEFAULT")
          : "AI",
      );
    } else {
      setScaleDenominator(500);
      setScaleInputValue("500");
      setScaleSource("DEFAULT");
    }
    setSheetSize(propertySheetSize);
    setScaleModalSheetSize(propertySheetSize);
  }

  async function loadRemotePlan(
    url: string,
    name: string,
    draft?: SavedDraft,
    initialLoad = false,
  ) {
    try {
      setStatus("Caricamento planimetria ERP");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      await loadPdfFromData(data, name);
      setDocumentSource({ kind: "remote", fileName: name, url });
      if (draft) {
        await restoreDraftSelections(draft);
        setStatus("Bozza ripristinata");
      } else if (!initialLoad) {
        pendingDraftRef.current = null;
        markDirty();
      } else {
        setStatus("Planimetria ERP caricata");
      }
    } catch (error) {
      console.error(error);
      setStatus("PDF ERP non caricato");
    }
  }

  async function loadPdfFile(file: File | undefined) {
    if (!file) return;
    try {
      const draft = pendingDraftRef.current;
      const restoresUpload =
        draft?.document?.kind === "upload" && draft.document.fileName === file.name;
      const data = await file.arrayBuffer();
      const name = file.name || "Planimetria importata.pdf";
      await loadPdfFromData(data, name);
      setDocumentSource({ kind: "upload", fileName: name });
      if (!restoresUpload) void triggerScaleExtraction(data, name);
      if (restoresUpload && draft) {
        await restoreDraftSelections(draft);
        setStatus("Bozza ripristinata");
      } else {
        pendingDraftRef.current = null;
        markDirty();
        const shouldSaveDocument = window.confirm("Vuoi salvare questa planimetria nei documenti dell'immobile?");
        if (shouldSaveDocument) {
          await uploadPlanimetriaDocument(data, name);
        } else {
          setStatus("PDF caricato localmente; planimetria non salvata nello storage");
        }
      }
    } catch (error) {
      console.error(error);
      setStatus("PDF non caricato");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function uploadPlanimetriaDocument(data: ArrayBuffer, name: string) {
    setStatus("Salvataggio planimetria nello storage");
    try {
      const response = await fetch(
        `${API_BASE_URL}/properties/${encodeURIComponent(property.id)}/documents/planimetria`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_name: name,
            file_base64: `data:application/pdf;base64,${arrayBufferToBase64(data)}`,
            mime_type: "application/pdf",
          }),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const uploaded = (await response.json()) as UploadedPropertyDocument;
      setDocumentSource({ kind: "remote", fileName: uploaded.fileName, url: uploaded.downloadUrl });
      onDocumentSaved?.(property.id, uploaded.fileName, uploaded.downloadUrl);
      markDirty();
      setStatus("Planimetria salvata nello storage documentale");
      return uploaded;
    } catch (error) {
      console.error(error);
      setStatus("Planimetria caricata localmente; salvataggio storage non riuscito");
      return null;
    }
  }

  async function triggerScaleExtraction(data: ArrayBuffer, name: string) {
    setScaleExtractionBusy(true);
    setScaleExtractionJob({
      id: "pending",
      propertyId: property.id,
      documentId: null,
      status: "PENDING",
      model: "",
      sourceFileName: name,
      sourceSha256: null,
      scale: null,
      confidence: null,
      evidence: null,
      warnings: [],
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setStatus("Analisi AI della scala planimetria");

    try {
      const response = await fetch(
        `${API_BASE_URL}/properties/${encodeURIComponent(property.id)}/scale-extraction-jobs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_name: name,
            mime_type: "application/pdf",
            file_base64: arrayBufferToBase64(data),
            apply_active_scale: true,
          }),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const createdJob = (await response.json()) as ScaleExtractionJob;
      setScaleExtractionJob(createdJob);
      await pollScaleExtractionJob(createdJob.id);
    } catch (error) {
      console.error(error);
      setScaleExtractionBusy(false);
      setScaleExtractionJob((job) =>
        job
          ? {
              ...job,
              status: "FAILED",
              errorMessage: error instanceof Error ? error.message : "Analisi scala non riuscita",
              updatedAt: new Date().toISOString(),
            }
          : job,
      );
      setStatus("Analisi scala non riuscita");
    }
  }

  async function triggerCurrentPdfScaleExtraction() {
    const data = runtimeRef.current.pdfData;
    if (!data || !fileName) {
      setStatus("Carica una planimetria prima dell'estrazione automatica");
      return;
    }
    await triggerScaleExtraction(data.slice(0), fileName);
  }

  async function pollScaleExtractionJob(jobId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt < 4 ? 1200 : 2500));
      const response = await fetch(
        `${API_BASE_URL}/properties/${encodeURIComponent(property.id)}/scale-extraction-jobs/${encodeURIComponent(jobId)}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const job = (await response.json()) as ScaleExtractionJob;
      setScaleExtractionJob(job);
      if (job.status === "SUCCEEDED" || job.status === "FAILED") {
        setScaleExtractionBusy(false);
        applyScaleExtractionJob(job, { forceActiveScale: true });
        return;
      }
    }
    setScaleExtractionBusy(false);
    setStatus("Analisi scala ancora in corso");
  }

  function applyScaleExtractionJob(job: ScaleExtractionJob, options: { forceActiveScale?: boolean } = {}) {
    if (job.status === "FAILED") {
      setStatus("Analisi scala non riuscita");
      return;
    }
    if (!job.scale) {
      setStatus("Scala non rilevata nella planimetria");
      return;
    }
    setAiScale({
      denominator: job.scale.denominator,
      label: job.scale.label,
      sheetSize: job.scale.sheetSize,
      confidence: job.confidence,
      detectedAt: job.completedAt ?? job.updatedAt,
    });
    const confidence = job.confidence ?? 0;
    if (!options.forceActiveScale && (calibration || isUserScaleSource(scaleSource))) {
      markDirty();
      setStatus(`Scala AI rilevata ${job.scale.label}; scala impostata manualmente mantenuta`);
      return;
    }
    if (confidence < 0.5) {
      markDirty();
      setStatus(`Scala AI rilevata ${job.scale.label} con confidenza bassa`);
      return;
    }

    recordUndoState();
    setScaleDenominator(job.scale.denominator);
    setScaleSource("AI");
    setScaleInputValue(String(job.scale.denominator));
    if (job.scale.sheetSize === "A3" || job.scale.sheetSize === "A4") {
      setSheetSize(job.scale.sheetSize);
      setScaleModalSheetSize(job.scale.sheetSize);
    }
    markDirty();
    setStatus(`Scala AI applicata: ${job.scale.label}`);
  }

  async function loadPdfFromData(data: ArrayBuffer, name: string) {
    const retainedData = data.slice(0);
    const loadingTask = pdfjsLib.getDocument({ data: data.slice(0), isEvalSupported: false });
    setEditorBusy(true);
    setStatus("Analisi PDF");
    try {
      const pdfDoc = await loadingTask.promise;
      const runtime = createRuntime();
      runtime.pdfDoc = pdfDoc;
      runtime.pdfData = retainedData;
      runtime.fileName = name;
      runtime.currentPage = 1;
      runtime.pageCount = pdfDoc.numPages;
      runtime.pageRotations = parsePageRotations(pendingDraftRef.current?.pageRotations);
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

  function canvasFromDataUrl(dataUrl: string, width: number, height: number) {
    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Contesto maschera non disponibile"));
          return;
        }
        context.drawImage(image, 0, 0);
        resolve(canvas);
      };
      image.onerror = () => reject(new Error("Maschera bozza non leggibile"));
      image.src = dataUrl;
    });
  }

  async function restoreDraftSelections(draft: SavedDraft) {
    const draftCustomUsages = customUsagesFromDraft(draft);
    setCustomUsages(draftCustomUsages);
    const restored = new Map<number, AreaSelection[]>();
    for (const saved of draft.selections) {
      const customUsage =
        saved.usageId === CUSTOM_USAGE_ID
          ? customUsageByIdOrLabel(draftCustomUsages, saved.customUsageId, saved.customUsageLabel)
          : null;
      const usage =
        saved.usageId === CUSTOM_USAGE_ID
          ? usageFromCustomPreset(customUsage, saved.customUsageLabel)
          : usageById(saved.usageId);
      const alphaCanvas = await canvasFromDataUrl(
        saved.region.alphaDataUrl,
        saved.region.width,
        saved.region.height,
      );
      const region: Region = {
        bounds: saved.region.bounds,
        seed: saved.region.seed,
        count: saved.region.count,
        alphaCanvas,
        width: saved.region.width,
        height: saved.region.height,
      };
      const selection: AreaSelection = {
        id: saved.id,
        page: saved.page,
        usageId: saved.usageId,
        customUsageId: saved.usageId === CUSTOM_USAGE_ID ? (customUsage?.id ?? saved.customUsageId) : undefined,
        customUsageLabel:
          saved.usageId === CUSTOM_USAGE_ID
            ? normalizeCustomUsageLabel(saved.customUsageLabel ?? customUsage?.label)
            : undefined,
        color: saved.color ?? usage.color,
        rate: saved.rate ?? usage.rate,
        areaOverrideM2:
          typeof saved.areaOverrideM2 === "number" && Number.isFinite(saved.areaOverrideM2)
            ? saved.areaOverrideM2
            : null,
        amountOverride:
          typeof saved.amountOverride === "number" && Number.isFinite(saved.amountOverride)
            ? saved.amountOverride
            : null,
        opacity: saved.opacity,
        totalPixels: saved.totalPixels,
        region,
        bitmap: createTintedCanvas(region, saved.color ?? usage.color, saved.opacity),
        source: saved.source ?? "smart",
        polygon: saved.polygon,
      };
      const pageSelections = restored.get(saved.page) ?? [];
      pageSelections.push(selection);
      restored.set(saved.page, pageSelections);
    }
    runtimeRef.current.selectionsByPage = restored;
    runtimeRef.current.history = draft.selections.map((selection) => selection.id);
    pendingDraftRef.current = null;
    redrawMasks();
    setDirty(false);
    bumpRevision();
  }

  async function saveDraft() {
    if (!canSaveDraft) return;
    const selectionsToSave = Array.from(runtimeRef.current.selectionsByPage.values())
      .flat()
      .map<SavedSelection>((selection) => ({
        id: selection.id,
        page: selection.page,
        usageId: selection.usageId,
        customUsageId: selection.customUsageId,
        customUsageLabel: selection.customUsageLabel,
        color: selection.color,
        rate: selection.rate,
        areaOverrideM2: selection.areaOverrideM2 ?? null,
        amountOverride: selection.amountOverride ?? null,
        opacity: selection.opacity,
        totalPixels: selection.totalPixels,
        source: selection.source,
        polygon: selection.polygon,
        region: {
          bounds: selection.region.bounds,
          seed: selection.region.seed,
          count: selection.region.count,
          width: selection.region.width,
          height: selection.region.height,
          alphaDataUrl: selection.region.alphaCanvas.toDataURL("image/png"),
        },
      }));
    const savedTime = new Date().toISOString();
    const draft: SavedDraft = {
      version: 1,
      propertyId: property.id,
      document: documentSource,
      savedAt: savedTime,
      sheetSize,
      scaleDenominator,
      scaleSource,
      aiScaleDenominator: aiScale.denominator,
      aiScaleLabel: aiScale.label,
      aiSheetSize: aiScale.sheetSize,
      aiScaleConfidence: aiScale.confidence,
      aiScaleDetectedAt: aiScale.detectedAt,
      pageRotations: serializePageRotations(runtimeRef.current.pageRotations),
      activeUsage,
      activeCustomUsageId,
      customUsages,
      customUsageLabel,
      opacityPercent,
      threshold,
      inflate,
      gap,
      dash,
      wallInclusionRadius,
      activeTool,
      calibration,
      totalArea: totals.area,
      totalEstimatedAmount: totals.amount,
      selections: selectionsToSave,
    };

    let localSaved = false;
    try {
      window.localStorage.setItem(draftKey(property.id), JSON.stringify(draft));
      pendingDraftRef.current = draft;
      localSaved = true;
    } catch (error) {
      console.error(error);
    }

    setStatus("Salvataggio bozza");
    try {
      const response = await fetch(
        `${API_BASE_URL}/properties/${encodeURIComponent(property.id)}/analysis-draft`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSavedAt(savedTime);
      setDirty(false);
      onDraftSaved?.(property.id, totals.amount);
      setStatus("Bozza salvata nel database");
    } catch (error) {
      console.error(error);
      if (localSaved) {
        setSavedAt(savedTime);
        setDirty(false);
        onDraftSaved?.(property.id, totals.amount);
        setStatus("Bozza salvata localmente; database non disponibile");
      } else {
        setStatus("Salvataggio non riuscito");
      }
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
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.floor(fit * 100)));
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
      const pageBaseRotation = pageRotationFromValue((page as { rotate?: number }).rotate);
      const pageRotation = normalizePageRotation(pageBaseRotation + (runtime.pageRotations.get(pageNumber) ?? 0));
      const baseViewport = page.getViewport({ scale: 1, rotation: pageRotation });
      const maxEdge = 3800;
      runtime.renderScale = Math.max(
        1.4,
        Math.min(3.2, maxEdge / Math.max(baseViewport.width, baseViewport.height)),
      );
      const viewport = page.getViewport({ scale: runtime.renderScale, rotation: pageRotation });
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
    radius: number,
  ) {
    const visual = new Uint8Array(mask);
    if (radius <= 0) return visual;
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

  function buildRegionFromMask(
    visualMask: Uint8Array,
    bounds: MaskBounds & { count?: number },
    seed: CanvasPoint,
    canvasWidth: number,
  ): Region {
    const finalBounds = {
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
    };
    const finalCount = bounds.count ?? 0;
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

  function rotateCanvasPoint(
    point: CanvasPoint,
    oldWidth: number,
    oldHeight: number,
    newWidth: number,
    newHeight: number,
    delta: PageRotation,
  ): CanvasPoint {
    let next = { ...point };
    if (delta === 90) next = { x: oldHeight - 1 - point.y, y: point.x };
    else if (delta === 180) next = { x: oldWidth - 1 - point.x, y: oldHeight - 1 - point.y };
    else if (delta === 270) next = { x: point.y, y: oldWidth - 1 - point.x };
    return {
      x: Math.max(0, Math.min(newWidth - 1, Math.round(next.x))),
      y: Math.max(0, Math.min(newHeight - 1, Math.round(next.y))),
    };
  }

  function rotateFullCanvas(source: HTMLCanvasElement, width: number, height: number, delta: PageRotation) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Contesto rotazione non disponibile");
    context.imageSmoothingEnabled = false;
    if (delta === 90) {
      context.translate(width, 0);
      context.rotate(Math.PI / 2);
    } else if (delta === 180) {
      context.translate(width, height);
      context.rotate(Math.PI);
    } else if (delta === 270) {
      context.translate(0, height);
      context.rotate(-Math.PI / 2);
    }
    context.drawImage(source, 0, 0);
    return canvas;
  }

  function regionFromAlphaPageCanvas(canvas: HTMLCanvasElement, seed: CanvasPoint): Region | null {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const { width, height } = canvas;
    const data = context.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const alpha = data[(row + x) * 4 + 3];
        if (alpha <= 8) continue;
        mask[row + x] = 1;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (count === 0) return null;
    return buildRegionFromMask(mask, { minX, minY, maxX, maxY, count }, seed, width);
  }

  function rotateRegion(
    region: Region,
    oldWidth: number,
    oldHeight: number,
    newWidth: number,
    newHeight: number,
    delta: PageRotation,
  ) {
    if (delta === 0) return region;
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = oldWidth;
    fullCanvas.height = oldHeight;
    const fullContext = fullCanvas.getContext("2d");
    if (!fullContext) return region;
    fullContext.imageSmoothingEnabled = false;
    fullContext.drawImage(region.alphaCanvas, region.bounds.minX, region.bounds.minY);
    const rotatedCanvas = rotateFullCanvas(fullCanvas, newWidth, newHeight, delta);
    const seed = rotateCanvasPoint(region.seed, oldWidth, oldHeight, newWidth, newHeight, delta);
    return regionFromAlphaPageCanvas(rotatedCanvas, seed) ?? region;
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
    const visualMask = includeNearbyBarriers(
      mask,
      wallMap,
      bounds,
      canvasWidth,
      canvasHeight,
      resolvedWallInclusionRadius,
    );
    let visualBounds = computeMaskBounds(visualMask, canvasWidth, canvasHeight);
    fillClosedHoles(visualMask, visualBounds, canvasWidth, canvasHeight);
    visualBounds = computeMaskBounds(visualMask, canvasWidth, canvasHeight) || { ...bounds, count };

    return buildRegionFromMask(visualMask, visualBounds, seed, canvasWidth);
  }

  function regionFromAlphaCanvas(canvas: HTMLCanvasElement, seed: CanvasPoint) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Contesto maschera non disponibile");
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const mask = new Uint8Array(canvas.width * canvas.height);
    let count = 0;
    let minX = canvas.width;
    let maxX = -1;
    let minY = canvas.height;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y++) {
      const row = y * canvas.width;
      for (let x = 0; x < canvas.width; x++) {
        const alpha = image.data[(row + x) * 4 + 3];
        if (alpha < 8) continue;
        mask[row + x] = 1;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (count < 8) return null;
    return buildRegionFromMask(mask, { minX, minY, maxX, maxY, count }, seed, canvas.width);
  }

  function createPolygonRegion(points: CanvasPoint[]) {
    const { pdfCanvas } = getCanvases();
    if (points.length < 3) return null;
    const canvas = document.createElement("canvas");
    canvas.width = pdfCanvas.width;
    canvas.height = pdfCanvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Contesto poligono non disponibile");
    context.fillStyle = "#000";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();

    const centroid = points.reduce(
      (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
      { x: 0, y: 0 },
    );
    return regionFromAlphaCanvas(canvas, {
      x: Math.round(centroid.x),
      y: Math.round(centroid.y),
    });
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

  function createManualRegion(): Region {
    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = 1;
    alphaCanvas.height = 1;
    return {
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      seed: { x: 0, y: 0 },
      count: 0,
      alphaCanvas,
      width: 1,
      height: 1,
    };
  }

  function cloneSelection(selection: AreaSelection): AreaSelection {
    const region = cloneRegion(selection.region);
    return {
      ...selection,
      region,
      bitmap: cloneCanvas(selection.bitmap),
      polygon: selection.polygon?.map((point) => ({ ...point })),
    };
  }

  function cloneSelectionsByPage(source: Map<number, AreaSelection[]>) {
    const next = new Map<number, AreaSelection[]>();
    source.forEach((items, page) => {
      next.set(page, items.map(cloneSelection));
    });
    return next;
  }

  function takeEditorSnapshot(): EditorSnapshot {
    return {
      selectionsByPage: cloneSelectionsByPage(runtimeRef.current.selectionsByPage),
      selectedIds: [...selectedSelectionIds],
      history: [...runtimeRef.current.history],
      calibration: calibration
        ? {
            ...calibration,
            start: { ...calibration.start },
            end: { ...calibration.end },
          }
        : null,
      rulerSegment: rulerSegment
        ? {
            page: rulerSegment.page,
            start: { ...rulerSegment.start },
            end: { ...rulerSegment.end },
          }
        : null,
      scaleDenominator,
      sheetSize,
      scaleSource,
      aiScale: { ...aiScale },
      pageRotations: new Map(runtimeRef.current.pageRotations),
      activeUsage,
      activeCustomUsageId,
      customUsages: customUsages.map((preset) => ({ ...preset })),
      customUsageLabel,
      opacityPercent,
      threshold,
      inflate,
      gap,
      dash,
      wallInclusionRadius,
      knownSegmentMeters,
    };
  }

  function recordUndoState() {
    const runtime = runtimeRef.current;
    runtime.undoStack.push(takeEditorSnapshot());
    if (runtime.undoStack.length > 40) runtime.undoStack.shift();
    runtime.redoStack = [];
  }

  function restoreEditorSnapshot(snapshot: EditorSnapshot) {
    runtimeRef.current.selectionsByPage = cloneSelectionsByPage(snapshot.selectionsByPage);
    runtimeRef.current.history = [...snapshot.history];
    const existingIds = new Set(
      Array.from(runtimeRef.current.selectionsByPage.values())
        .flat()
        .map((selection) => selection.id),
    );
    setSelectedSelectionIds(snapshot.selectedIds.filter((id) => existingIds.has(id)));
    setCalibration(
      snapshot.calibration
        ? {
            ...snapshot.calibration,
            start: { ...snapshot.calibration.start },
            end: { ...snapshot.calibration.end },
          }
        : null,
    );
    setRulerSegment(
      snapshot.rulerSegment
        ? {
            page: snapshot.rulerSegment.page,
            start: { ...snapshot.rulerSegment.start },
            end: { ...snapshot.rulerSegment.end },
          }
        : snapshot.calibration
          ? {
              page: snapshot.calibration.page,
              start: { ...snapshot.calibration.start },
              end: { ...snapshot.calibration.end },
            }
          : null,
    );
    setRulerSegmentSelected(false);
    setSelectedPolygonVertex(null);
    setHoverPolygonInsert(null);
    setScaleDenominator(snapshot.scaleDenominator);
    setSheetSize(snapshot.sheetSize);
    setScaleSource(snapshot.scaleSource);
    setAiScale({ ...snapshot.aiScale });
    const currentRotation = runtimeRef.current.pageRotations.get(runtimeRef.current.currentPage) ?? 0;
    const restoredRotation = snapshot.pageRotations.get(runtimeRef.current.currentPage) ?? 0;
    runtimeRef.current.pageRotations = new Map(snapshot.pageRotations);
    setActiveUsage(snapshot.activeUsage);
    setActiveCustomUsageId(snapshot.activeCustomUsageId);
    setCustomUsages(snapshot.customUsages.map((preset) => ({ ...preset })));
    setCustomUsageLabel(snapshot.customUsageLabel);
    setOpacityPercent(snapshot.opacityPercent);
    setThreshold(snapshot.threshold);
    setInflate(snapshot.inflate);
    setGap(snapshot.gap);
    setDash(snapshot.dash);
    setWallInclusionRadius(snapshot.wallInclusionRadius);
    setKnownSegmentMeters(snapshot.knownSegmentMeters);
    runtimeRef.current.wallMap = null;
    runtimeRef.current.wallKey = "";
    if (currentRotation !== restoredRotation && runtimeRef.current.pdfDoc && runtimeRef.current.currentPage) {
      void renderPage(runtimeRef.current.currentPage);
    } else {
      redrawMasks();
    }
    markDirty();
    bumpRevision();
  }

  function undoSelectionEdit() {
    const runtime = runtimeRef.current;
    const previous = runtime.undoStack.pop();
    if (!previous) return;
    runtime.redoStack.push(takeEditorSnapshot());
    restoreEditorSnapshot(previous);
    setStatus("Modifica annullata");
  }

  function redoSelectionEdit() {
    const runtime = runtimeRef.current;
    const next = runtime.redoStack.pop();
    if (!next) return;
    runtime.undoStack.push(takeEditorSnapshot());
    restoreEditorSnapshot(next);
    setStatus("Modifica ripristinata");
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

  function commitSelection(
    region: Region,
    usageId: UsageId,
    opacity: number,
    source: SelectionSource = "smart",
    polygon?: CanvasPoint[],
    options: {
      recordHistory?: boolean;
      select?: boolean;
      rate?: number;
      customUsageId?: string;
      customUsageLabel?: string;
      color?: string;
    } = {},
  ) {
    const customPreset =
      usageId === CUSTOM_USAGE_ID
        ? customUsageByIdOrLabel(
            customUsages,
            options.customUsageId ?? activeCustomUsageId,
            options.customUsageLabel ?? customUsageLabel,
          )
        : null;
    const customLabel =
      usageId === CUSTOM_USAGE_ID
        ? normalizeCustomUsageLabel(options.customUsageLabel ?? customPreset?.label ?? customUsageLabel)
        : undefined;
    if (usageId === CUSTOM_USAGE_ID && !customLabel) {
      setStatus("Crea o seleziona una destinazione custom");
      bumpRevision();
      return null;
    }
    const usage = usageId === CUSTOM_USAGE_ID ? usageFromCustomPreset(customPreset, customLabel) : usageById(usageId);
    const rate = options.rate ?? usage.rate;
    const color = options.color ?? usage.color;
    const customUsageId = usageId === CUSTOM_USAGE_ID ? customPreset?.id ?? options.customUsageId : undefined;
    const selectionsForPage = currentSelections();
    const duplicateIndex = selectionsForPage.findIndex((selection) => sameRegion(selection.region, region));
    const shouldRecord = options.recordHistory !== false;
    const shouldSelect = options.select !== false;

    if (duplicateIndex >= 0) {
      if (shouldRecord) recordUndoState();
      const selection = selectionsForPage[duplicateIndex];
      selection.usageId = usageId;
      selection.customUsageId = customUsageId;
      selection.customUsageLabel = customLabel;
      selection.color = color;
      selection.rate = rate;
      selection.opacity = opacity;
      selection.region = region;
      selection.bitmap = createTintedCanvas(region, color, opacity);
      selection.source = source;
      selection.polygon = polygon;
      redrawMasks();
      setStatus(`Area ${duplicateIndex + 1} aggiornata`);
      if (shouldSelect) setSelectedSelectionIds([selection.id]);
      setRulerSegmentSelected(false);
      markDirty();
      bumpRevision();
      return selection.id;
    }

    if (shouldRecord) recordUndoState();
    const selection = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      page: runtimeRef.current.currentPage,
      usageId,
      customUsageId,
      customUsageLabel: customLabel,
      color,
      rate,
      opacity,
      totalPixels: getCanvasTotalPixels(),
      region,
      bitmap: createTintedCanvas(region, color, opacity),
      source,
      polygon,
    };
    selectionsForPage.push(selection);
    runtimeRef.current.history.push(selection.id);
    redrawMasks();
    setStatus(`Area ${selectionsForPage.length} tracciata`);
    if (shouldSelect) setSelectedSelectionIds([selection.id]);
    setRulerSegmentSelected(false);
    markDirty();
    bumpRevision();
    return selection.id;
  }

  function addManualAreaRow() {
    if (!canUseActiveUsage()) return;
    const customPreset =
      activeUsage === CUSTOM_USAGE_ID
        ? customUsageByIdOrLabel(customUsages, activeCustomUsageId, customUsageLabel)
        : null;
    const customLabel =
      activeUsage === CUSTOM_USAGE_ID
        ? normalizeCustomUsageLabel(customPreset?.label ?? customUsageLabel)
        : undefined;
    const usage = activeUsage === CUSTOM_USAGE_ID ? usageFromCustomPreset(customPreset, customLabel) : usageById(activeUsage);
    const region = createManualRegion();
    const opacity = opacityPercent / 100;
    const page = hasPdf ? runtimeRef.current.currentPage : 1;
    const selection: AreaSelection = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      page,
      usageId: activeUsage,
      customUsageId: activeUsage === CUSTOM_USAGE_ID ? customPreset?.id ?? activeCustomUsageId ?? undefined : undefined,
      customUsageLabel: customLabel,
      color: usage.color,
      rate: usage.rate,
      opacity,
      areaOverrideM2: 0,
      amountOverride: null,
      totalPixels: 0,
      region,
      bitmap: createTintedCanvas(region, usage.color, opacity),
      source: "manual",
    };
    recordUndoState();
    const pageSelections = runtimeRef.current.selectionsByPage.get(page) ?? [];
    pageSelections.push(selection);
    runtimeRef.current.selectionsByPage.set(page, pageSelections);
    runtimeRef.current.history.push(selection.id);
    setSelectedSelectionIds([selection.id]);
    setRulerSegmentSelected(false);
    setStatus("Riga area manuale aggiunta");
    markDirty();
    bumpRevision();
    if (hasPdf) redrawMasks();
  }

  function drawPolygonPath(
    context: CanvasRenderingContext2D,
    points: CanvasPoint[],
    closePath: boolean,
  ) {
    if (points.length === 0) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    if (closePath) context.closePath();
  }

  function boundaryPathsForRegion(region: Region) {
    const cached = outlinePathCacheRef.current.get(region.alphaCanvas);
    if (cached) return cached;

    const context = region.alphaCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];

    const { width, height } = region;
    const data = context.getImageData(0, 0, width, height).data;
    const segments: Array<{ start: CanvasPoint; end: CanvasPoint }> = [];
    const adjacency = new Map<string, number[]>();

    function alphaAt(x: number, y: number) {
      if (x < 0 || y < 0 || x >= width || y >= height) return 0;
      return data[(y * width + x) * 4 + 3];
    }

    function pointKey(point: CanvasPoint) {
      return `${point.x}:${point.y}`;
    }

    function samePoint(a: CanvasPoint, b: CanvasPoint) {
      return a.x === b.x && a.y === b.y;
    }

    function addAdjacency(point: CanvasPoint, segmentIndex: number) {
      const key = pointKey(point);
      const items = adjacency.get(key);
      if (items) items.push(segmentIndex);
      else adjacency.set(key, [segmentIndex]);
    }

    function addSegment(start: CanvasPoint, end: CanvasPoint) {
      const index = segments.length;
      segments.push({ start, end });
      addAdjacency(start, index);
      addAdjacency(end, index);
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (alphaAt(x, y) <= 8) continue;
        if (alphaAt(x, y - 1) <= 8) addSegment({ x, y }, { x: x + 1, y });
        if (alphaAt(x + 1, y) <= 8) addSegment({ x: x + 1, y }, { x: x + 1, y: y + 1 });
        if (alphaAt(x, y + 1) <= 8) addSegment({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
        if (alphaAt(x - 1, y) <= 8) addSegment({ x, y: y + 1 }, { x, y });
      }
    }

    const used = new Uint8Array(segments.length);
    const paths: CanvasPoint[][] = [];
    for (let index = 0; index < segments.length; index++) {
      if (used[index]) continue;
      const firstSegment = segments[index];
      const firstKey = pointKey(firstSegment.start);
      const path = [firstSegment.start, firstSegment.end];
      used[index] = 1;

      let current = firstSegment.end;
      for (let guard = 0; guard < segments.length; guard++) {
        if (pointKey(current) === firstKey) break;
        const nextSegmentIndex = (adjacency.get(pointKey(current)) ?? []).find((segmentIndex) => !used[segmentIndex]);
        if (nextSegmentIndex === undefined) break;
        used[nextSegmentIndex] = 1;
        const nextSegment = segments[nextSegmentIndex];
        current = samePoint(nextSegment.start, current) ? nextSegment.end : nextSegment.start;
        path.push(current);
      }

      if (path.length > 1) paths.push(path);
    }

    outlinePathCacheRef.current.set(region.alphaCanvas, paths);
    return paths;
  }

  function drawRegionBoundaryOutline(context: CanvasRenderingContext2D, selection: AreaSelection) {
    const paths = boundaryPathsForRegion(selection.region);
    if (paths.length === 0) return;

    const { bounds } = selection.region;
    context.beginPath();
    paths.forEach((path) => {
      context.moveTo(bounds.minX + path[0].x, bounds.minY + path[0].y);
      path.slice(1).forEach((point) => context.lineTo(bounds.minX + point.x, bounds.minY + point.y));
    });
    context.stroke();
  }

  function drawSelectionOutline(context: CanvasRenderingContext2D, selection: AreaSelection) {
    context.save();
    context.strokeStyle = "#0d6efd";
    context.lineWidth = 3;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.setLineDash([12, 8]);
    if (selection.polygon && selection.polygon.length >= 3) {
      drawPolygonPath(context, selection.polygon, true);
      context.stroke();
    } else {
      drawRegionBoundaryOutline(context, selection);
    }
    context.restore();
  }

  function drawPolygonEditHandles(context: CanvasRenderingContext2D, selection: AreaSelection) {
    if (!selection.polygon || selection.polygon.length < 3) return;
    if (activeTool !== "select" && activeTool !== "polygon") return;

    const isSelectedVertex = (index: number) =>
      selectedPolygonVertex?.selectionId === selection.id && selectedPolygonVertex.vertexIndex === index;

    context.save();
    selection.polygon.forEach((point, index) => {
      context.beginPath();
      context.arc(point.x, point.y, isSelectedVertex(index) ? 11 : 8, 0, Math.PI * 2);
      context.fillStyle = isSelectedVertex(index) ? "#0d6efd" : "#ffffff";
      context.fill();
      context.lineWidth = isSelectedVertex(index) ? 4 : 3;
      context.strokeStyle = selection.color;
      context.stroke();
    });

    if (hoverPolygonInsert?.selectionId === selection.id) {
      context.beginPath();
      context.arc(hoverPolygonInsert.point.x, hoverPolygonInsert.point.y, 7, 0, Math.PI * 2);
      context.fillStyle = "#ffffff";
      context.fill();
      context.lineWidth = 3;
      context.strokeStyle = "#0d6efd";
      context.setLineDash([4, 4]);
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(hoverPolygonInsert.point.x - 5, hoverPolygonInsert.point.y);
      context.lineTo(hoverPolygonInsert.point.x + 5, hoverPolygonInsert.point.y);
      context.moveTo(hoverPolygonInsert.point.x, hoverPolygonInsert.point.y - 5);
      context.lineTo(hoverPolygonInsert.point.x, hoverPolygonInsert.point.y + 5);
      context.stroke();
    }
    context.restore();
  }

  function drawSegmentOverlay(
    context: CanvasRenderingContext2D,
    segment: MeasureSegment | SavedCalibration,
    color: string,
    dashed = false,
    label?: string,
    selected = false,
  ) {
    context.save();
    if (selected) {
      context.strokeStyle = "rgba(13, 110, 253, 0.24)";
      context.lineWidth = 16;
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(segment.start.x, segment.start.y);
      context.lineTo(segment.end.x, segment.end.y);
      context.stroke();
    }
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = selected ? 6 : 4;
    context.setLineDash(dashed ? [12, 8] : []);
    context.beginPath();
    context.moveTo(segment.start.x, segment.start.y);
    context.lineTo(segment.end.x, segment.end.y);
    context.stroke();
    [segment.start, segment.end].forEach((point) => {
      context.beginPath();
      context.arc(point.x, point.y, 7, 0, Math.PI * 2);
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = "#ffffff";
      context.stroke();
    });
    if (label) {
      const midX = (segment.start.x + segment.end.x) / 2;
      const midY = (segment.start.y + segment.end.y) / 2;
      context.font = "700 28px Inter, system-ui, sans-serif";
      const metrics = context.measureText(label);
      context.fillStyle = "rgba(15, 23, 42, 0.86)";
      context.fillRect(midX - metrics.width / 2 - 12, midY - 44, metrics.width + 24, 34);
      context.fillStyle = "#ffffff";
      context.fillText(label, midX - metrics.width / 2, midY - 20);
    }
    context.restore();
  }

  function drawEditorOverlays(context: CanvasRenderingContext2D) {
    selectedCurrentPageSelections.forEach((selection) => {
      drawSelectionOutline(context, selection);
      drawPolygonEditHandles(context, selection);
    });

    if (marqueeDraft) {
      const rect = rectFromPoints(marqueeDraft.start, marqueeDraft.current);
      context.save();
      context.fillStyle = "rgba(13, 110, 253, 0.12)";
      context.strokeStyle = "#0d6efd";
      context.lineWidth = 2;
      context.setLineDash([10, 6]);
      context.fillRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);
      context.strokeRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);
      context.restore();
    }

    if (polygonDraft.length > 0) {
      const points = pointerPreview ? [...polygonDraft, pointerPreview] : polygonDraft;
      context.save();
      context.strokeStyle = activeUsageOption.color;
      context.fillStyle = activeUsageOption.color;
      context.lineWidth = 3;
      context.setLineDash([10, 8]);
      drawPolygonPath(context, points, false);
      context.stroke();
      polygonDraft.forEach((point, index) => {
        context.beginPath();
        context.arc(point.x, point.y, index === 0 ? 9 : 6, 0, Math.PI * 2);
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = "#ffffff";
        context.stroke();
      });
      context.restore();
    }

    if (calibration && calibration.page === runtimeRef.current.currentPage) {
      drawSegmentOverlay(
        context,
        calibration,
        "#0f766e",
        false,
        `${areaFormatter.format(calibration.knownMeters)} m`,
        rulerSegmentSelected,
      );
    }

    const segment = rulerDraft ?? rulerSegment;
    const segmentIsCalibrated =
      Boolean(calibration && segment) &&
      calibration?.page === segment?.page &&
      calibration?.start.x === segment?.start.x &&
      calibration?.start.y === segment?.start.y &&
      calibration?.end.x === segment?.end.x &&
      calibration?.end.y === segment?.end.y;
    if (segment && segment.page === runtimeRef.current.currentPage && !segmentIsCalibrated) {
      const meters = segmentMetersFromScale(segment);
      drawSegmentOverlay(
        context,
        segment,
        rulerDraft ? "#f59e0b" : "#0d6efd",
        Boolean(rulerDraft),
        `${areaFormatter.format(meters)} m`,
        rulerSegmentSelected,
      );
    }
  }

  function redrawMasks() {
    const { maskCanvas, mask } = getCanvases();
    mask.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    if (!runtimeRef.current.pdfDoc) return;
    currentSelections().forEach((selection) => {
      mask.drawImage(selection.bitmap, selection.region.bounds.minX, selection.region.bounds.minY);
    });
    drawEditorOverlays(mask);
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

  async function fillAtCanvasPoint(x: number, y: number, appendToSelection = false) {
    const runtime = runtimeRef.current;
    if (!runtime.pdfDoc || runtime.animating) return;
    if (!canUseActiveUsage()) return;
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
      if (appendToSelection) {
        appendSmartRegion(region, opacity);
      } else {
        commitSelection(region, activeUsage, opacity, "smart");
      }
    } catch (error) {
      console.error(error);
      setStatus("Selezione non riuscita");
    } finally {
      setEditorBusy(false);
    }
  }

  function removeSelections(ids: string[]) {
    const idsToRemove = new Set(ids);
    const hasAny = Array.from(runtimeRef.current.selectionsByPage.values())
      .flat()
      .some((selection) => idsToRemove.has(selection.id));
    if (!hasAny) return;

    recordUndoState();
    for (const [page, pageSelections] of runtimeRef.current.selectionsByPage.entries()) {
      for (let index = pageSelections.length - 1; index >= 0; index--) {
        if (idsToRemove.has(pageSelections[index].id)) pageSelections.splice(index, 1);
      }
      if (page === runtimeRef.current.currentPage) redrawMasks();
    }
    runtimeRef.current.history = runtimeRef.current.history.filter((selectionId) => !idsToRemove.has(selectionId));
    setSelectedSelectionIds((current) => current.filter((selectionId) => !idsToRemove.has(selectionId)));
    setCollapsedAreaIds((current) => current.filter((selectionId) => !idsToRemove.has(selectionId)));
    setSelectedPolygonVertex((current) => (current && idsToRemove.has(current.selectionId) ? null : current));
    setHoverPolygonInsert((current) => (current && idsToRemove.has(current.selectionId) ? null : current));
    setStatus(idsToRemove.size === 1 ? "Area rimossa" : "Aree rimosse");
    markDirty();
    bumpRevision();
  }

  function removeSelection(id: string) {
    removeSelections([id]);
  }

  function removeMeasureSegment() {
    if (!rulerSegment && !calibration) return;
    recordUndoState();
    setRulerSegment(null);
    setCalibration(null);
    setRulerSegmentSelected(false);
    setStatus("Segmento rimosso");
    markDirty();
    bumpRevision();
  }

  function deleteSelectedObjects() {
    setDeleteMenuOpen(false);
    if (selectedPolygonVertex) {
      deleteSelectedPolygonVertex();
      return;
    }
    if (selectedSelectionIds.length > 0) {
      removeSelections(selectedSelectionIds);
      return;
    }
    if (rulerSegmentSelected) removeMeasureSegment();
  }

  function requestClearCurrentPage() {
    setDeleteMenuOpen(false);
    if (!hasCurrentPageAreas) return;
    setClearPageConfirmOpen(true);
  }

  function confirmClearCurrentPage() {
    setClearPageConfirmOpen(false);
    clearCurrentPage();
  }

  function clearCurrentPage() {
    const pageSelections = currentSelections();
    if (pageSelections.length === 0) return;
    recordUndoState();
    const currentPageIds = new Set(pageSelections.map((selection) => selection.id));
    pageSelections.splice(0);
    setSelectedSelectionIds((current) => current.filter((id) => !currentPageIds.has(id)));
    setCollapsedAreaIds((current) => current.filter((id) => !currentPageIds.has(id)));
    setSelectedPolygonVertex((current) => (current && currentPageIds.has(current.selectionId) ? null : current));
    setHoverPolygonInsert((current) => (current && currentPageIds.has(current.selectionId) ? null : current));
    runtimeRef.current.history = runtimeRef.current.history.filter((id) => {
      for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
        if (pageSelections.some((selection) => selection.id === id)) return true;
      }
      return false;
    });
    redrawMasks();
    setStatus("Pagina pulita");
    markDirty();
    bumpRevision();
  }

  function buildCustomUsagePreset(options: { label?: string; color?: string; rate?: number } = {}) {
    const label = nextCustomUsageLabel(customUsages, options.label ?? "Custom");
    return {
      id: createCustomUsageId(label, customUsages.length),
      label,
      color: isHexColor(options.color)
        ? options.color!.toLowerCase()
        : CUSTOM_USAGE_COLORS[customUsages.length % CUSTOM_USAGE_COLORS.length],
      rate: typeof options.rate === "number" && Number.isFinite(options.rate) ? options.rate : usageById(CUSTOM_USAGE_ID).rate,
    };
  }

  function selectCustomUsagePreset(presetId: string) {
    const preset = customUsages.find((item) => item.id === presetId);
    if (!preset) return;
    if (activeUsage === CUSTOM_USAGE_ID && activeCustomUsageId === preset.id) return;
    recordUndoState();
    setActiveUsage(CUSTOM_USAGE_ID);
    setActiveCustomUsageId(preset.id);
    setCustomUsageLabel(preset.label);
    setStatus(`Destinazione d'uso: ${preset.label}`);
    markDirty();
  }

  function createCustomUsagePreset() {
    const preset = buildCustomUsagePreset();
    recordUndoState();
    setCustomUsages((current) => [...current, preset]);
    setActiveUsage(CUSTOM_USAGE_ID);
    setActiveCustomUsageId(preset.id);
    setCustomUsageLabel(preset.label);
    setStatus(`Destinazione custom creata: ${preset.label}`);
    markDirty();
    bumpRevision();
  }

  function renameCustomUsagePreset(presetId: string, rawLabel: string) {
    const preset = customUsages.find((item) => item.id === presetId);
    if (!preset) return false;
    const nextLabel = normalizeCustomUsageLabel(rawLabel);
    if (!nextLabel) {
      setStatus("Il nome della destinazione custom e obbligatorio");
      bumpRevision();
      return false;
    }
    if (nextLabel === preset.label) return true;
    const duplicate = customUsages.find(
      (item) => item.id !== preset.id && item.label.toLowerCase() === nextLabel.toLowerCase(),
    );
    if (duplicate) {
      setStatus(`Destinazione custom gia esistente: ${duplicate.label}`);
      bumpRevision();
      return false;
    }

    recordUndoState();
    const previousLabel = preset.label;
    setCustomUsages((current) =>
      current.map((item) => (item.id === preset.id ? { ...item, label: nextLabel } : item)),
    );
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      pageSelections.forEach((selection) => {
        const matchesPreset =
          selection.usageId === CUSTOM_USAGE_ID &&
          (selection.customUsageId === preset.id ||
            (!selection.customUsageId && selection.customUsageLabel?.toLowerCase() === previousLabel.toLowerCase()));
        if (!matchesPreset) return;
        selection.customUsageId = preset.id;
        selection.customUsageLabel = nextLabel;
      });
    }
    if (activeCustomUsageId === preset.id) setCustomUsageLabel(nextLabel);
    redrawMasks();
    setStatus(`Destinazione custom rinominata: ${nextLabel}`);
    markDirty();
    bumpRevision();
    return true;
  }

  function changeCustomUsageColor(presetId: string, color: string) {
    if (!isHexColor(color)) return;
    const preset = customUsages.find((item) => item.id === presetId);
    if (!preset || preset.color.toLowerCase() === color.toLowerCase()) return;
    recordUndoState();
    setCustomUsages((current) =>
      current.map((item) => (item.id === preset.id ? { ...item, color: color.toLowerCase() } : item)),
    );
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      pageSelections.forEach((selection) => {
        const matchesPreset =
          selection.usageId === CUSTOM_USAGE_ID &&
          (selection.customUsageId === preset.id ||
            (!selection.customUsageId && selection.customUsageLabel?.toLowerCase() === preset.label.toLowerCase()));
        if (!matchesPreset) return;
        selection.customUsageId = preset.id;
        selection.color = color;
        selection.bitmap = createTintedCanvas(selection.region, color, selection.opacity);
      });
    }
    redrawMasks();
    setStatus(`Colore custom aggiornato: ${preset.label}`);
    markDirty();
    bumpRevision();
  }

  function deleteCustomUsagePreset(presetId: string) {
    const preset = customUsages.find((item) => item.id === presetId);
    if (!preset) return;
    recordUndoState();
    const nextCustomUsages = customUsages.filter((item) => item.id !== preset.id);
    setCustomUsages(nextCustomUsages);
    let affectedSelections = 0;
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      pageSelections.forEach((selection) => {
        if (selection.usageId !== CUSTOM_USAGE_ID || selection.customUsageId !== preset.id) return;
        selection.customUsageId = undefined;
        affectedSelections += 1;
      });
    }
    if (activeCustomUsageId === preset.id) {
      const nextActiveCustom = nextCustomUsages[0] ?? null;
      setActiveUsage(nextActiveCustom ? CUSTOM_USAGE_ID : "capannone");
      setActiveCustomUsageId(nextActiveCustom?.id ?? null);
      setCustomUsageLabel(nextActiveCustom?.label ?? "");
    }
    redrawMasks();
    setStatus(
      affectedSelections > 0
        ? `Preset custom rimosso; ${affectedSelections} aree esistenti mantenute`
        : `Preset custom eliminato: ${preset.label}`,
    );
    markDirty();
    bumpRevision();
  }

  function changeSelectionUsage(id: string, usageId: UsageId) {
    if (usageId === CUSTOM_USAGE_ID) return;
    const usage = usageById(usageId);
    const selection = findSelectionById(id);
    if (!selection) return;
    recordUndoState();
    selection.usageId = usageId;
    selection.customUsageId = undefined;
    selection.customUsageLabel = undefined;
    selection.color = usage.color;
    selection.rate = usage.rate;
    selection.bitmap = createTintedCanvas(selection.region, usage.color, selection.opacity);
    redrawMasks();
    setStatus(`Area aggiornata: ${usage.label}`);
    markDirty();
    bumpRevision();
  }

  function changeSelectionCustomUsage(id: string, presetId: string) {
    const preset = customUsages.find((item) => item.id === presetId);
    const selection = findSelectionById(id);
    if (!preset || !selection) return;
    recordUndoState();
    selection.usageId = CUSTOM_USAGE_ID;
    selection.customUsageId = preset.id;
    selection.customUsageLabel = preset.label;
    selection.color = preset.color;
    selection.rate = preset.rate;
    selection.bitmap = createTintedCanvas(selection.region, preset.color, selection.opacity);
    setActiveUsage(CUSTOM_USAGE_ID);
    setActiveCustomUsageId(preset.id);
    setCustomUsageLabel(preset.label);
    redrawMasks();
    setStatus(`Area aggiornata: ${preset.label}`);
    markDirty();
    bumpRevision();
  }

  function changeSelectionUsageChoice(id: string, value: string) {
    if (value.startsWith("fixed:")) {
      changeSelectionUsage(id, value.slice("fixed:".length) as UsageId);
      return;
    }
    if (value.startsWith("custom:")) {
      changeSelectionCustomUsage(id, value.slice("custom:".length));
    }
  }

  function createCustomUsageForSelection(id: string) {
    const selection = findSelectionById(id);
    if (!selection) return;
    const preset = buildCustomUsagePreset({
      color: selection.usageId === CUSTOM_USAGE_ID ? selection.color : undefined,
      rate: selection.usageId === CUSTOM_USAGE_ID ? selection.rate : undefined,
    });
    recordUndoState();
    setCustomUsages((current) => [...current, preset]);
    selection.usageId = CUSTOM_USAGE_ID;
    selection.customUsageId = preset.id;
    selection.customUsageLabel = preset.label;
    selection.color = preset.color;
    selection.rate = preset.rate;
    selection.bitmap = createTintedCanvas(selection.region, preset.color, selection.opacity);
    setActiveUsage(CUSTOM_USAGE_ID);
    setActiveCustomUsageId(preset.id);
    setCustomUsageLabel(preset.label);
    redrawMasks();
    setStatus(`Nuova destinazione custom applicata: ${preset.label}`);
    markDirty();
    bumpRevision();
  }

  function renameSelectionCustomUsage(id: string, rawLabel: string) {
    const selection = findSelectionById(id);
    if (!selection || selection.usageId !== CUSTOM_USAGE_ID) return false;
    const nextLabel = normalizeCustomUsageLabel(rawLabel);
    if (!nextLabel) {
      setStatus("Il nome della destinazione custom e obbligatorio");
      bumpRevision();
      return false;
    }
    const preset = customUsageByIdOrLabel(customUsages, selection.customUsageId, selection.customUsageLabel);
    if (preset) return renameCustomUsagePreset(preset.id, nextLabel);

    const existing = customUsages.find((item) => item.label.toLowerCase() === nextLabel.toLowerCase());
    if (existing) {
      changeSelectionCustomUsage(id, existing.id);
      return true;
    }

    const newPreset = {
      ...buildCustomUsagePreset({
        label: nextLabel,
        color: selection.color,
        rate: selection.rate,
      }),
      label: nextLabel,
    };
    recordUndoState();
    setCustomUsages((current) => [...current, newPreset]);
    selection.customUsageId = newPreset.id;
    selection.customUsageLabel = newPreset.label;
    setActiveUsage(CUSTOM_USAGE_ID);
    setActiveCustomUsageId(newPreset.id);
    setCustomUsageLabel(newPreset.label);
    redrawMasks();
    setStatus(`Destinazione custom creata: ${newPreset.label}`);
    markDirty();
    bumpRevision();
    return true;
  }

  function selectionCustomUsagePreset(selection: AreaSelection) {
    if (selection.usageId !== CUSTOM_USAGE_ID) return null;
    return customUsageByIdOrLabel(customUsages, selection.customUsageId, selection.customUsageLabel);
  }

  function selectionUsageChoiceValue(selection: AreaSelection) {
    if (selection.usageId !== CUSTOM_USAGE_ID) return `fixed:${selection.usageId}`;
    const preset = selectionCustomUsagePreset(selection);
    return preset ? `custom:${preset.id}` : `orphan:${selection.id}`;
  }

  function changeSelectionColor(id: string, color: string) {
    if (!isHexColor(color)) return;
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      const selection = pageSelections.find((item) => item.id === id);
      if (!selection || selection.color.toLowerCase() === color.toLowerCase()) continue;
      recordUndoState();
      selection.color = color;
      selection.bitmap = createTintedCanvas(selection.region, color, selection.opacity);
      redrawMasks();
      setStatus("Colore area aggiornato");
      markDirty();
      bumpRevision();
      return;
    }
  }

  function changeSelectionOpacity(id: string, nextOpacityPercent: number) {
    const opacity = Math.min(100, Math.max(5, nextOpacityPercent)) / 100;
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      const selection = pageSelections.find((item) => item.id === id);
      if (!selection || Math.round(selection.opacity * 100) === Math.round(opacity * 100)) continue;
      recordUndoState();
      selection.opacity = opacity;
      selection.bitmap = createTintedCanvas(selection.region, selection.color, opacity);
      redrawMasks();
      setStatus("Opacita area aggiornata");
      markDirty();
      bumpRevision();
      return;
    }
  }

  function changeSelectionRate(id: string, rawValue: string) {
    const parsed = parseNumberInput(rawValue);
    if (parsed === null) {
      setStatus("Inserisci un valore valido");
      bumpRevision();
      return null;
    }
    const nextRate = Math.max(0, parsed);
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      const selection = pageSelections.find((item) => item.id === id);
      if (!selection) continue;
      if (selection.rate === nextRate) return selection.rate;
      recordUndoState();
      selection.rate = nextRate;
      setStatus("Valore area aggiornato");
      markDirty();
      bumpRevision();
      return nextRate;
    }
    return null;
  }

  function changeSelectionAreaOverride(id: string, rawValue: string, calculatedArea: number) {
    const parsed = parseNumberInput(rawValue);
    if (parsed === null || parsed < 0) {
      setStatus("Inserisci una superficie valida");
      bumpRevision();
      return null;
    }
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      const selection = pageSelections.find((item) => item.id === id);
      if (!selection) continue;
      const nextOverride = Math.abs(parsed - calculatedArea) < 0.005 ? null : parsed;
      if ((selection.areaOverrideM2 ?? null) === nextOverride) {
        return effectiveSelectionAreaM2(selection, calculatedArea);
      }
      recordUndoState();
      selection.areaOverrideM2 = nextOverride;
      setStatus(nextOverride === null ? "Override superficie rimosso" : "Superficie manuale aggiornata");
      markDirty();
      bumpRevision();
      return nextOverride ?? calculatedArea;
    }
    return null;
  }

  function clearSelectionAreaOverride(id: string) {
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      const selection = pageSelections.find((item) => item.id === id);
      if (!selection || selection.areaOverrideM2 === null || selection.areaOverrideM2 === undefined) continue;
      recordUndoState();
      selection.areaOverrideM2 = null;
      setStatus("Override superficie rimosso");
      markDirty();
      bumpRevision();
      return;
    }
  }

  function clearSelectionAmountOverride(id: string) {
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      const selection = pageSelections.find((item) => item.id === id);
      if (!selection || selection.amountOverride === null || selection.amountOverride === undefined) continue;
      recordUndoState();
      selection.amountOverride = null;
      setStatus("Override stima rimosso");
      markDirty();
      bumpRevision();
      return;
    }
  }

  function updateMaskOpacity(nextOpacityPercent: number) {
    const opacity = nextOpacityPercent / 100;
    if (nextOpacityPercent === opacityPercent) return;
    recordUndoState();
    setOpacityPercent(nextOpacityPercent);
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      pageSelections.forEach((selection) => {
        selection.opacity = opacity;
        selection.bitmap = createTintedCanvas(selection.region, selection.color, opacity);
      });
    }
    if (hasPdf) redrawMasks();
    markDirty();
    bumpRevision();
  }

  function canvasPointFromEvent(event: PointerEvent<HTMLDivElement>, options?: { clamp?: boolean }) {
    const stage = stageRef.current;
    const pdfCanvas = pdfCanvasRef.current;
    if (!stage || !pdfCanvas) return null;
    const rect = stage.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * (pdfCanvas.width / rect.width));
    const y = Math.floor((event.clientY - rect.top) * (pdfCanvas.height / rect.height));
    if (options?.clamp) {
      return {
        x: Math.max(0, Math.min(pdfCanvas.width - 1, x)),
        y: Math.max(0, Math.min(pdfCanvas.height - 1, y)),
      };
    }
    if (x < 0 || y < 0 || x >= pdfCanvas.width || y >= pdfCanvas.height) return null;
    return { x, y };
  }

  function hitTestSelection(point: CanvasPoint) {
    const pageSelections = currentSelections();
    for (let index = pageSelections.length - 1; index >= 0; index--) {
      const selection = pageSelections[index];
      const { bounds } = selection.region;
      if (
        point.x < bounds.minX ||
        point.x > bounds.maxX ||
        point.y < bounds.minY ||
        point.y > bounds.maxY
      ) {
        continue;
      }
      const context = selection.region.alphaCanvas.getContext("2d", { willReadFrequently: true });
      if (!context) continue;
      const localX = point.x - bounds.minX;
      const localY = point.y - bounds.minY;
      const alpha = context.getImageData(localX, localY, 1, 1).data[3];
      if (alpha > 8) return selection;
    }
    return null;
  }

  function rectFromPoints(start: CanvasPoint, end: CanvasPoint): MaskBounds {
    return {
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y),
    };
  }

  function boundsIntersectRect(bounds: MaskBounds, rect: MaskBounds) {
    return (
      bounds.maxX >= rect.minX &&
      bounds.minX <= rect.maxX &&
      bounds.maxY >= rect.minY &&
      bounds.minY <= rect.maxY
    );
  }

  function selectionIntersectsRect(selection: AreaSelection, rect: MaskBounds) {
    const { bounds } = selection.region;
    if (!boundsIntersectRect(bounds, rect)) return false;

    const minX = Math.max(bounds.minX, rect.minX);
    const minY = Math.max(bounds.minY, rect.minY);
    const maxX = Math.min(bounds.maxX, rect.maxX);
    const maxY = Math.min(bounds.maxY, rect.maxY);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (width <= 0 || height <= 0) return false;
    if (minX <= bounds.minX && minY <= bounds.minY && maxX >= bounds.maxX && maxY >= bounds.maxY) {
      return selection.region.count > 0;
    }

    const context = selection.region.alphaCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    const localX = minX - bounds.minX;
    const localY = minY - bounds.minY;
    const data = context.getImageData(localX, localY, width, height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 8) return true;
    }
    return false;
  }

  function pointInRect(point: CanvasPoint, rect: MaskBounds) {
    return point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY;
  }

  function segmentIntersectsRect(segment: MeasureSegment, rect: MaskBounds) {
    if (pointInRect(segment.start, rect) || pointInRect(segment.end, rect)) return true;
    const corners = [
      { x: rect.minX, y: rect.minY },
      { x: rect.maxX, y: rect.minY },
      { x: rect.maxX, y: rect.maxY },
      { x: rect.minX, y: rect.maxY },
    ];
    const edges: Array<[CanvasPoint, CanvasPoint]> = [
      [corners[0], corners[1]],
      [corners[1], corners[2]],
      [corners[2], corners[3]],
      [corners[3], corners[0]],
    ];
    return edges.some(([start, end]) => segmentsIntersect(segment.start, segment.end, start, end));
  }

  function segmentsIntersect(a: CanvasPoint, b: CanvasPoint, c: CanvasPoint, d: CanvasPoint) {
    function orientation(p: CanvasPoint, q: CanvasPoint, r: CanvasPoint) {
      const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
      if (Math.abs(value) < 0.0001) return 0;
      return value > 0 ? 1 : 2;
    }
    function onSegment(p: CanvasPoint, q: CanvasPoint, r: CanvasPoint) {
      return (
        q.x <= Math.max(p.x, r.x) &&
        q.x >= Math.min(p.x, r.x) &&
        q.y <= Math.max(p.y, r.y) &&
        q.y >= Math.min(p.y, r.y)
      );
    }
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(a, c, b)) return true;
    if (o2 === 0 && onSegment(a, d, b)) return true;
    if (o3 === 0 && onSegment(c, a, d)) return true;
    return o4 === 0 && onSegment(c, b, d);
  }

  function distanceToSegment(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return distance(point, start);
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const projection = { x: start.x + t * dx, y: start.y + t * dy };
    return distance(point, projection);
  }

  function activeMeasureSegment() {
    return rulerSegment ?? (calibration ? { page: calibration.page, start: calibration.start, end: calibration.end } : null);
  }

  function hitTestMeasureSegment(point: CanvasPoint) {
    const segment = activeMeasureSegment();
    if (!segment || segment.page !== runtimeRef.current.currentPage) return false;
    const threshold = Math.max(12, Math.round(10 * runtimeRef.current.renderScale));
    return distanceToSegment(point, segment.start, segment.end) <= threshold;
  }

  function hitTestMeasureSegmentHandle(point: CanvasPoint) {
    const segment = activeMeasureSegment();
    if (!segment || segment.page !== runtimeRef.current.currentPage) return null;
    const endpointThreshold = Math.max(14, Math.round(10 * runtimeRef.current.renderScale));
    if (distance(point, segment.start) <= endpointThreshold) return "start" as const;
    if (distance(point, segment.end) <= endpointThreshold) return "end" as const;
    const bodyThreshold = Math.max(12, Math.round(8 * runtimeRef.current.renderScale));
    if (distanceToSegment(point, segment.start, segment.end) <= bodyThreshold) return "body" as const;
    return null;
  }

  function selectedEditablePolygons() {
    return selectedCurrentPageSelections.filter(
      (selection) => selection.polygon && selection.polygon.length >= 3,
    );
  }

  function hitTestPolygonVertex(point: CanvasPoint) {
    const threshold = Math.max(12, Math.round(9 * runtimeRef.current.renderScale));
    const polygons = selectedEditablePolygons();
    for (let selectionIndex = polygons.length - 1; selectionIndex >= 0; selectionIndex--) {
      const selection = polygons[selectionIndex];
      const points = selection.polygon;
      if (!points) continue;
      for (let index = points.length - 1; index >= 0; index--) {
        if (distance(point, points[index]) <= threshold) {
          return { selection, vertexIndex: index };
        }
      }
    }
    return null;
  }

  function hitTestPolygonInsert(point: CanvasPoint): PolygonInsertTarget | null {
    const threshold = Math.max(10, Math.round(7 * runtimeRef.current.renderScale));
    const polygons = selectedEditablePolygons();
    for (let selectionIndex = polygons.length - 1; selectionIndex >= 0; selectionIndex--) {
      const selection = polygons[selectionIndex];
      const points = selection.polygon;
      if (!points) continue;
      for (let index = 0; index < points.length; index++) {
        const start = points[index];
        const end = points[(index + 1) % points.length];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared === 0) continue;
        const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
        if (t < 0.16 || t > 0.84) continue;
        const projected = { x: Math.round(start.x + t * dx), y: Math.round(start.y + t * dy) };
        if (distance(point, projected) <= threshold) {
          return { selectionId: selection.id, edgeIndex: index, point: projected };
        }
      }
    }
    return null;
  }

  function clampDeltaForSnapshots(snapshots: DragSnapshot[], dx: number, dy: number) {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return { dx, dy };
    let nextDx = dx;
    let nextDy = dy;
    snapshots.forEach((snapshot) => {
      nextDx = Math.max(nextDx, -snapshot.bounds.minX);
      nextDx = Math.min(nextDx, canvas.width - 1 - snapshot.bounds.maxX);
      nextDy = Math.max(nextDy, -snapshot.bounds.minY);
      nextDy = Math.min(nextDy, canvas.height - 1 - snapshot.bounds.maxY);
    });
    return { dx: Math.round(nextDx), dy: Math.round(nextDy) };
  }

  function applyDragDelta(state: DragState, dx: number, dy: number) {
    const byId = new Map(currentSelections().map((selection) => [selection.id, selection]));
    state.snapshots.forEach((snapshot) => {
      const selection = byId.get(snapshot.id);
      if (!selection) return;
      selection.region.bounds = {
        minX: snapshot.bounds.minX + dx,
        minY: snapshot.bounds.minY + dy,
        maxX: snapshot.bounds.maxX + dx,
        maxY: snapshot.bounds.maxY + dy,
      };
      selection.region.seed = translatePoint(snapshot.seed, dx, dy);
      if (snapshot.polygon) {
        selection.polygon = snapshot.polygon.map((point) => translatePoint(point, dx, dy));
      }
    });
    redrawMasks();
  }

  function startSelectionDrag(point: CanvasPoint, selectionIds: string[]) {
    const selected = currentSelections().filter((selection) => selectionIds.includes(selection.id));
    if (selected.length === 0) return;
    dragStateRef.current = {
      start: point,
      historyRecorded: false,
      snapshots: selected.map((selection) => ({
        id: selection.id,
        bounds: { ...selection.region.bounds },
        seed: { ...selection.region.seed },
        polygon: selection.polygon?.map((item) => ({ ...item })),
      })),
    };
  }

  function selectionIdsInRect(rect: MaskBounds) {
    return currentSelections()
      .filter((selection) => selectionIntersectsRect(selection, rect))
      .map((selection) => selection.id);
  }

  function computeMarqueeSelection(current: CanvasPoint) {
    const drag = marqueeDragRef.current;
    if (!drag) return { ids: [] as string[], rulerSelected: false, rect: rectFromPoints(current, current) };
    const rect = rectFromPoints(drag.start, current);
    const hitIds = selectionIdsInRect(rect);
    const ids = drag.append ? Array.from(new Set([...drag.initialSelectedIds, ...hitIds])) : hitIds;
    const segment = activeMeasureSegment();
    const rulerSelected =
      drag.initialRulerSelected ||
      Boolean(segment && segment.page === runtimeRef.current.currentPage && segmentIntersectsRect(segment, rect));
    return { ids, rulerSelected, rect };
  }

  function updateMarqueeSelection(current: CanvasPoint) {
    const drag = marqueeDragRef.current;
    if (!drag) return;
    setMarqueeDraft({ start: drag.start, current });
    const { ids, rulerSelected, rect } = computeMarqueeSelection(current);
    const tooSmall = rect.maxX - rect.minX < 5 && rect.maxY - rect.minY < 5;
    setSelectedSelectionIds(tooSmall ? drag.initialSelectedIds : ids);
    setRulerSegmentSelected(tooSmall ? drag.initialRulerSelected : rulerSelected);
    setSelectedPolygonVertex(null);
    setHoverPolygonInsert(null);
  }

  function finishMarqueeSelection(current: CanvasPoint) {
    const drag = marqueeDragRef.current;
    if (!drag) return;
    const { ids, rulerSelected, rect } = computeMarqueeSelection(current);
    const tooSmall = rect.maxX - rect.minX < 5 && rect.maxY - rect.minY < 5;
    const finalIds = tooSmall ? drag.initialSelectedIds : ids;
    setSelectedSelectionIds(finalIds);
    setRulerSegmentSelected(tooSmall ? drag.initialRulerSelected : rulerSelected);
    setMarqueeDraft(null);
    marqueeDragRef.current = null;
    if (!tooSmall) {
      const total = finalIds.length + (rulerSelected ? 1 : 0);
      setStatus(total === 1 ? "1 elemento selezionato" : `${total} elementi selezionati`);
    }
  }

  function findSelectionById(id: string) {
    for (const pageSelections of runtimeRef.current.selectionsByPage.values()) {
      const selection = pageSelections.find((item) => item.id === id);
      if (selection) return selection;
    }
    return null;
  }

  function replacePolygonSelection(selectionId: string, points: CanvasPoint[]) {
    if (points.length < 3) return false;
    const selection = findSelectionById(selectionId);
    if (!selection) return false;
    const region = createPolygonRegion(points);
    if (!region) return false;
    selection.polygon = points.map((point) => ({ ...point }));
    selection.region = region;
    selection.totalPixels = getCanvasTotalPixels();
    selection.bitmap = createTintedCanvas(region, selection.color, selection.opacity);
    redrawMasks();
    bumpRevision();
    return true;
  }

  function deleteSelectedPolygonVertex() {
    if (!selectedPolygonVertex) return;
    const selection = findSelectionById(selectedPolygonVertex.selectionId);
    if (!selection?.polygon) return;
    if (selection.polygon.length <= 3) {
      setStatus("Un poligono deve avere almeno tre vertici");
      return;
    }
    recordUndoState();
    const nextPoints = selection.polygon.filter((_, index) => index !== selectedPolygonVertex.vertexIndex);
    if (!replacePolygonSelection(selection.id, nextPoints)) return;
    setSelectedSelectionIds([selection.id]);
    setSelectedPolygonVertex(null);
    setStatus("Vertice rimosso");
    markDirty();
  }

  function addPolygonVertex(target: PolygonInsertTarget) {
    const selection = findSelectionById(target.selectionId);
    if (!selection?.polygon) return null;
    recordUndoState();
    const nextPoints = selection.polygon.map((point) => ({ ...point }));
    const vertexIndex = target.edgeIndex + 1;
    nextPoints.splice(vertexIndex, 0, { ...target.point });
    if (!replacePolygonSelection(selection.id, nextPoints)) return null;
    setSelectedSelectionIds([selection.id]);
    setSelectedPolygonVertex({ selectionId: selection.id, vertexIndex });
    setStatus("Vertice aggiunto");
    markDirty();
    return { selectionId: selection.id, vertexIndex };
  }

  function updatePolygonVertex(selectionId: string, vertexIndex: number, point: CanvasPoint) {
    const selection = findSelectionById(selectionId);
    if (!selection?.polygon) return false;
    const nextPoints = selection.polygon.map((item, index) =>
      index === vertexIndex ? { ...point } : { ...item },
    );
    return replacePolygonSelection(selectionId, nextPoints);
  }

  function clampCanvasPoint(point: CanvasPoint) {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return point;
    return {
      x: Math.max(0, Math.min(canvas.width - 1, Math.round(point.x))),
      y: Math.max(0, Math.min(canvas.height - 1, Math.round(point.y))),
    };
  }

  function clampSegment(segment: MeasureSegment) {
    return {
      page: segment.page,
      start: clampCanvasPoint(segment.start),
      end: clampCanvasPoint(segment.end),
    };
  }

  function scaleFromKnownSegmentValue(segment: MeasureSegment, knownMeters: number) {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return null;
    const segmentPixels = distance(segment.start, segment.end);
    if (segmentPixels < 12 || knownMeters <= 0) return null;
    const sheet = orientedSheetSize(sheetSize, canvas.width, canvas.height);
    const dxMm = (segment.end.x - segment.start.x) * (sheet.widthMm / canvas.width);
    const dyMm = (segment.end.y - segment.start.y) * (sheet.heightMm / canvas.height);
    const segmentMmOnSheet = Math.hypot(dxMm, dyMm);
    if (segmentMmOnSheet <= 0) return null;
    return Math.min(20000, Math.max(20, Math.round((knownMeters * 1000) / segmentMmOnSheet)));
  }

  function applySegmentEdit(nextSegment: MeasureSegment) {
    const clamped = clampSegment(nextSegment);
    setRulerSegment(clamped);
    if (calibration) {
      const nextScale = scaleFromKnownSegmentValue(clamped, calibration.knownMeters);
      setCalibration({
        ...calibration,
        start: clamped.start,
        end: clamped.end,
        scaleDenominator: nextScale ?? calibration.scaleDenominator,
      });
      if (nextScale) {
        setScaleDenominator(nextScale);
        setScaleSource("CALIBRATION");
      }
    }
    setRulerSegmentSelected(true);
    redrawMasks();
    bumpRevision();
  }

  function cloneRegion(region: Region, dx = 0, dy = 0): Region {
    return {
      bounds: {
        minX: region.bounds.minX + dx,
        minY: region.bounds.minY + dy,
        maxX: region.bounds.maxX + dx,
        maxY: region.bounds.maxY + dy,
      },
      seed: translatePoint(region.seed, dx, dy),
      count: region.count,
      alphaCanvas: cloneCanvas(region.alphaCanvas),
      width: region.width,
      height: region.height,
    };
  }

  function copySelectedSelections() {
    const source = selectedSelections;
    if (source.length === 0) return;
    clipboardRef.current = source.map((selection) => ({
      usageId: selection.usageId,
      customUsageId: selection.customUsageId,
      customUsageLabel: selection.customUsageLabel,
      color: selection.color,
      opacity: selection.opacity,
      rate: selection.rate,
      areaOverrideM2: selection.areaOverrideM2,
      amountOverride: selection.amountOverride,
      totalPixels: selection.totalPixels,
      source: selection.source === "merged" ? "merged" : "copy",
      polygon: selection.polygon?.map((point) => ({ ...point })),
      region: cloneRegion(selection.region),
    }));
    setClipboardCount(clipboardRef.current.length);
    setStatus(`${clipboardRef.current.length} aree copiate`);
  }

  function pasteCopiedSelections() {
    if (!hasPdf || clipboardRef.current.length === 0) return;
    recordUndoState();
    const offset = Math.max(18, Math.round(24 * runtimeRef.current.renderScale));
    const snapshots = clipboardRef.current.map<DragSnapshot>((item, index) => ({
      id: String(index),
      bounds: item.region.bounds,
      seed: item.region.seed,
      polygon: item.polygon,
    }));
    const { dx, dy } = clampDeltaForSnapshots(snapshots, offset, offset);
    const pastedIds: string[] = [];
    const pageSelections = currentSelections();
    clipboardRef.current.forEach((item) => {
      const customUsage =
        item.usageId === CUSTOM_USAGE_ID
          ? customUsageByIdOrLabel(customUsages, item.customUsageId, item.customUsageLabel)
          : null;
      const usage =
        item.usageId === CUSTOM_USAGE_ID
          ? usageFromCustomPreset(customUsage, item.customUsageLabel)
          : usageById(item.usageId);
      const color = item.color ?? usage.color;
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
      const region = cloneRegion(item.region, dx, dy);
      const selection: AreaSelection = {
        id,
        page: runtimeRef.current.currentPage,
        usageId: item.usageId,
        customUsageId: item.customUsageId,
        customUsageLabel: item.customUsageLabel,
        color,
        rate: item.rate,
        areaOverrideM2: item.areaOverrideM2,
        amountOverride: item.amountOverride,
        opacity: item.opacity,
        totalPixels: getCanvasTotalPixels(),
        region,
        bitmap: createTintedCanvas(region, color, item.opacity),
        source: "copy",
        polygon: item.polygon?.map((point) => translatePoint(point, dx, dy)),
      };
      pageSelections.push(selection);
      runtimeRef.current.history.push(id);
      pastedIds.push(id);
    });
    setSelectedSelectionIds(pastedIds);
    redrawMasks();
    setStatus(`${pastedIds.length} aree incollate`);
    markDirty();
    bumpRevision();
  }

  function unionRegions(regions: Region[], seed: CanvasPoint) {
    const { pdfCanvas } = getCanvases();
    const canvas = document.createElement("canvas");
    canvas.width = pdfCanvas.width;
    canvas.height = pdfCanvas.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    regions.forEach((region) => {
      context.drawImage(region.alphaCanvas, region.bounds.minX, region.bounds.minY);
    });
    return regionFromAlphaCanvas(canvas, seed);
  }

  function removeSelectionsFromCurrentPage(ids: Set<string>) {
    const pageSelections = currentSelections();
    for (let index = pageSelections.length - 1; index >= 0; index--) {
      if (ids.has(pageSelections[index].id)) pageSelections.splice(index, 1);
    }
    runtimeRef.current.history = runtimeRef.current.history.filter((id) => !ids.has(id));
  }

  function appendSmartRegion(region: Region, opacity: number) {
    const selected = selectedCurrentPageSelections;
    if (selected.length === 0) {
      commitSelection(region, activeUsage, opacity, "smart");
      return;
    }

    recordUndoState();
    const regions = [...selected.map((selection) => selection.region), region];
    const seed = {
      x: Math.round(
        (selected.reduce((sum, selection) => sum + selection.region.seed.x, 0) + region.seed.x) /
          (selected.length + 1),
      ),
      y: Math.round(
        (selected.reduce((sum, selection) => sum + selection.region.seed.y, 0) + region.seed.y) /
          (selected.length + 1),
      ),
    };
    const mergedRegion = unionRegions(regions, seed);
    if (!mergedRegion) return;
    removeSelectionsFromCurrentPage(new Set(selected.map((selection) => selection.id)));
    const mergedId = commitSelection(mergedRegion, activeUsage, opacity, "merged", undefined, {
      recordHistory: false,
      customUsageId: activeCustomUsageId ?? undefined,
      customUsageLabel,
    });
    if (mergedId) setSelectedSelectionIds([mergedId]);
    setStatus(`${selected.length + 1} aree unite con Smart Selection`);
  }

  function mergeSelectedSelections() {
    const selected = selectedCurrentPageSelections;
    if (selected.length < 2) return;
    recordUndoState();
    const first = selected[0];
    const center = selected.reduce(
      (acc, selection) => ({
        x: acc.x + selection.region.seed.x / selected.length,
        y: acc.y + selection.region.seed.y / selected.length,
      }),
      { x: 0, y: 0 },
    );
    const region = unionRegions(selected.map((selection) => selection.region), {
      x: Math.round(center.x),
      y: Math.round(center.y),
    });
    if (!region) return;
    const ids = new Set(selected.map((selection) => selection.id));
    removeSelectionsFromCurrentPage(ids);
    const mergedId = commitSelection(region, first.usageId, first.opacity, "merged", undefined, {
      recordHistory: false,
      rate: first.rate,
      customUsageId: first.customUsageId,
      customUsageLabel: first.customUsageLabel,
      color: first.color,
    });
    if (mergedId) setSelectedSelectionIds([mergedId]);
    setStatus(`${selected.length} aree unite`);
  }

  function segmentMetersFromScale(segment: MeasureSegment, scale = scaleDenominator) {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return 0;
    const sheet = orientedSheetSize(sheetSize, canvas.width, canvas.height);
    const dxMm = (segment.end.x - segment.start.x) * (sheet.widthMm / canvas.width);
    const dyMm = (segment.end.y - segment.start.y) * (sheet.heightMm / canvas.height);
    return (Math.hypot(dxMm, dyMm) * scale) / 1000;
  }

  function scaleFromKnownSegment(segment: MeasureSegment, knownMeters: number) {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return null;
    const segmentPixels = distance(segment.start, segment.end);
    if (segmentPixels < 12 || knownMeters <= 0) {
      setStatus("Segmento di taratura troppo corto");
      return null;
    }
    const sheet = orientedSheetSize(sheetSize, canvas.width, canvas.height);
    const dxMm = (segment.end.x - segment.start.x) * (sheet.widthMm / canvas.width);
    const dyMm = (segment.end.y - segment.start.y) * (sheet.heightMm / canvas.height);
    const segmentMmOnSheet = Math.hypot(dxMm, dyMm);
    if (segmentMmOnSheet <= 0) return null;
    return Math.min(20000, Math.max(20, Math.round((knownMeters * 1000) / segmentMmOnSheet)));
  }

  function applyCalibrationFromRuler() {
    if (!rulerSegment) {
      setStatus("Disegna prima un segmento con il righello");
      return;
    }
    const knownMeters = commitKnownSegmentInput({ recordHistory: false });
    if (!knownMeters) {
      setStatus("Inserisci la distanza nota del segmento");
      return;
    }
    const clampedScale = scaleFromKnownSegment(rulerSegment, knownMeters);
    if (!clampedScale) return;
    recordUndoState();
    const nextCalibration = {
      page: runtimeRef.current.currentPage,
      knownMeters,
      scaleDenominator: clampedScale,
      start: rulerSegment.start,
      end: rulerSegment.end,
    };
    setScaleDenominator(clampedScale);
    setScaleSource("CALIBRATION");
    setCalibration(nextCalibration);
    setRulerSegment(rulerSegment);
    setStatus(`Scala tarata a 1:${clampedScale}`);
    markDirty();
    bumpRevision();
  }

  function onStagePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !hasPdf || busy) return;
    const point = canvasPointFromEvent(event);
    if (!point) return;

    if (activeTool === "select" || activeTool === "polygon") {
      const vertexHit = hitTestPolygonVertex(point);
      if (vertexHit) {
        setSelectedSelectionIds([vertexHit.selection.id]);
        setSelectedPolygonVertex({ selectionId: vertexHit.selection.id, vertexIndex: vertexHit.vertexIndex });
        setRulerSegmentSelected(false);
        polygonEditDragRef.current = {
          selectionId: vertexHit.selection.id,
          vertexIndex: vertexHit.vertexIndex,
          historyRecorded: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }

      const insertHit = hitTestPolygonInsert(point);
      if (insertHit) {
        const inserted = addPolygonVertex(insertHit);
        if (inserted) {
          polygonEditDragRef.current = { ...inserted, historyRecorded: true };
          setHoverPolygonInsert(null);
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
      }
    }

    if (activeTool === "select") {
      const segmentHandle = hitTestMeasureSegmentHandle(point);
      const segment = activeMeasureSegment();
      if (segmentHandle && segment) {
        setSelectedSelectionIds([]);
        setSelectedPolygonVertex(null);
        setHoverPolygonInsert(null);
        setRulerSegmentSelected(true);
        segmentDragRef.current = {
          mode: segmentHandle,
          start: point,
          initialSegment: {
            page: segment.page,
            start: { ...segment.start },
            end: { ...segment.end },
          },
          historyRecorded: false,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }

    if (activeTool === "smart") {
      void fillAtCanvasPoint(point.x, point.y, event.shiftKey);
      return;
    }

    if (activeTool === "polygon") {
      if (!canUseActiveUsage()) return;
      const firstPoint = polygonDraft[0];
      const closeThreshold = Math.max(12, Math.round(12 * runtimeRef.current.renderScale));
      if (firstPoint && polygonDraft.length >= 3 && distance(point, firstPoint) <= closeThreshold) {
        const region = createPolygonRegion(polygonDraft);
        if (region) {
          commitSelection(region, activeUsage, opacityPercent / 100, "polygon", polygonDraft);
          setPolygonDraft([]);
          setPointerPreview(null);
          setStatus("Poligono chiuso");
        }
        return;
      }
      setPolygonDraft((current) => [...current, point]);
      setPointerPreview(point);
      setStatus("Aggiungi vertici, poi clicca sul primo punto per chiudere");
      return;
    }

    if (activeTool === "ruler") {
      rulerDragRef.current = point;
      setRulerDraft({
        page: runtimeRef.current.currentPage,
        start: point,
        end: point,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const hit = hitTestSelection(point);
    const hitSegment = hitTestMeasureSegment(point);
    if (!hit && hitSegment) {
      setSelectedSelectionIds([]);
      setSelectedPolygonVertex(null);
      setHoverPolygonInsert(null);
      setRulerSegmentSelected(true);
      redrawMasks();
      return;
    }

    if (!hit) {
      if (activeTool === "select") {
        const append = event.shiftKey || event.metaKey || event.ctrlKey;
        marqueeDragRef.current = {
          start: point,
          append,
          initialSelectedIds: append ? [...selectedSelectionIds] : [],
          initialRulerSelected: append ? rulerSegmentSelected : false,
        };
        setMarqueeDraft({ start: point, current: point });
        if (!append) {
          setSelectedSelectionIds([]);
          setRulerSegmentSelected(false);
        }
        setSelectedPolygonVertex(null);
        setHoverPolygonInsert(null);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
        setSelectedSelectionIds([]);
        setRulerSegmentSelected(false);
        setSelectedPolygonVertex(null);
        setHoverPolygonInsert(null);
      }
      redrawMasks();
      return;
    }

    let nextSelectedIds: string[];
    const alreadySelected = selectedSelectionIds.includes(hit.id);
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      nextSelectedIds = alreadySelected
        ? selectedSelectionIds.filter((id) => id !== hit.id)
        : [...selectedSelectionIds, hit.id];
    } else {
      nextSelectedIds = alreadySelected ? selectedSelectionIds : [hit.id];
    }
    setSelectedSelectionIds(nextSelectedIds);
    setSelectedPolygonVertex(null);
    setHoverPolygonInsert(null);
    setRulerSegmentSelected(false);
    if (nextSelectedIds.includes(hit.id)) {
      startSelectionDrag(point, nextSelectedIds);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function onStagePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!hasPdf) return;
    const shouldClampPointer = Boolean(
      segmentDragRef.current ||
        polygonEditDragRef.current ||
        marqueeDragRef.current ||
        rulerDragRef.current ||
        dragStateRef.current,
    );
    const point = canvasPointFromEvent(event, { clamp: shouldClampPointer });
    if (!point) return;

    const segmentDrag = segmentDragRef.current;
    if (segmentDrag) {
      const rawDx = point.x - segmentDrag.start.x;
      const rawDy = point.y - segmentDrag.start.y;
      let nextSegment = segmentDrag.initialSegment;
      if (segmentDrag.mode === "body") {
        const canvas = pdfCanvasRef.current;
        let dx = Math.round(rawDx);
        let dy = Math.round(rawDy);
        if (canvas) {
          const minX = Math.min(segmentDrag.initialSegment.start.x, segmentDrag.initialSegment.end.x);
          const maxX = Math.max(segmentDrag.initialSegment.start.x, segmentDrag.initialSegment.end.x);
          const minY = Math.min(segmentDrag.initialSegment.start.y, segmentDrag.initialSegment.end.y);
          const maxY = Math.max(segmentDrag.initialSegment.start.y, segmentDrag.initialSegment.end.y);
          dx = Math.max(dx, -minX);
          dx = Math.min(dx, canvas.width - 1 - maxX);
          dy = Math.max(dy, -minY);
          dy = Math.min(dy, canvas.height - 1 - maxY);
        }
        nextSegment = {
          page: segmentDrag.initialSegment.page,
          start: translatePoint(segmentDrag.initialSegment.start, dx, dy),
          end: translatePoint(segmentDrag.initialSegment.end, dx, dy),
        };
      } else {
        nextSegment = {
          ...segmentDrag.initialSegment,
          [segmentDrag.mode]: clampCanvasPoint(point),
        };
      }
      if (!segmentDrag.historyRecorded && (rawDx !== 0 || rawDy !== 0)) {
        recordUndoState();
        segmentDrag.historyRecorded = true;
      }
      applySegmentEdit(nextSegment);
      return;
    }

    const polygonEditDrag = polygonEditDragRef.current;
    if (polygonEditDrag) {
      if (!polygonEditDrag.historyRecorded) {
        recordUndoState();
        polygonEditDrag.historyRecorded = true;
      }
      updatePolygonVertex(polygonEditDrag.selectionId, polygonEditDrag.vertexIndex, clampCanvasPoint(point));
      setSelectedPolygonVertex({
        selectionId: polygonEditDrag.selectionId,
        vertexIndex: polygonEditDrag.vertexIndex,
      });
      return;
    }

    if (marqueeDragRef.current) {
      updateMarqueeSelection(point);
      return;
    }

    if (activeTool === "polygon" && polygonDraft.length > 0) {
      setPointerPreview(point);
      return;
    }

    if (activeTool === "ruler" && rulerDragRef.current) {
      setRulerDraft({
        page: runtimeRef.current.currentPage,
        start: rulerDragRef.current,
        end: point,
      });
      return;
    }

    const dragState = dragStateRef.current;
    if (activeTool === "select" && dragState) {
      const rawDx = point.x - dragState.start.x;
      const rawDy = point.y - dragState.start.y;
      const { dx, dy } = clampDeltaForSnapshots(dragState.snapshots, rawDx, rawDy);
      if ((dx !== 0 || dy !== 0) && !dragState.historyRecorded) {
        recordUndoState();
        dragState.historyRecorded = true;
      }
      applyDragDelta(dragState, dx, dy);
      return;
    }

    if ((activeTool === "select" || activeTool === "polygon") && selectedEditablePolygons().length > 0) {
      const insertHit = hitTestPolygonInsert(point);
      const current = hoverPolygonInsert;
      const changed =
        Boolean(insertHit) !== Boolean(current) ||
        insertHit?.selectionId !== current?.selectionId ||
        insertHit?.edgeIndex !== current?.edgeIndex ||
        insertHit?.point.x !== current?.point.x ||
        insertHit?.point.y !== current?.point.y;
      if (changed) setHoverPolygonInsert(insertHit);
    } else if (hoverPolygonInsert) {
      setHoverPolygonInsert(null);
    }
  }

  function onStagePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!hasPdf) return;
    const shouldClampPointer = Boolean(
      segmentDragRef.current ||
        polygonEditDragRef.current ||
        marqueeDragRef.current ||
        rulerDragRef.current ||
        dragStateRef.current,
    );
    const point = canvasPointFromEvent(event, { clamp: shouldClampPointer });

    function releasePointer() {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released when the pointer leaves the stage.
      }
    }

    const segmentDrag = segmentDragRef.current;
    if (segmentDrag) {
      segmentDragRef.current = null;
      if (segmentDrag.historyRecorded) {
        const segment = activeMeasureSegment();
        if (segment && distance(segment.start, segment.end) < 12) {
          applySegmentEdit(segmentDrag.initialSegment);
          setStatus("Segmento troppo corto");
        } else {
          setStatus(segmentDrag.mode === "body" ? "Segmento spostato" : "Estremo segmento aggiornato");
          markDirty();
        }
      }
      releasePointer();
      return;
    }

    const polygonEditDrag = polygonEditDragRef.current;
    if (polygonEditDrag) {
      polygonEditDragRef.current = null;
      if (polygonEditDrag.historyRecorded) {
        setStatus("Vertice aggiornato");
        markDirty();
      }
      releasePointer();
      return;
    }

    const marqueeDrag = marqueeDragRef.current;
    if (marqueeDrag) {
      finishMarqueeSelection(point ?? marqueeDrag.start);
      releasePointer();
      return;
    }

    if (activeTool === "ruler" && rulerDragRef.current && point) {
      const segment = {
        page: runtimeRef.current.currentPage,
        start: rulerDragRef.current,
        end: point,
      };
      if (distance(segment.start, segment.end) >= 12) {
        recordUndoState();
        setRulerSegment(segment);
        setRulerSegmentSelected(true);
        setSelectedSelectionIds([]);
        setRulerDraft(null);
        setStatus(`Distanza misurata: ${areaFormatter.format(segmentMetersFromScale(segment))} m`);
      } else {
        setRulerDraft(null);
        setStatus("Segmento troppo corto");
      }
      rulerDragRef.current = null;
      releasePointer();
      return;
    }

    if (activeTool === "ruler" && rulerDragRef.current) {
      rulerDragRef.current = null;
      setRulerDraft(null);
      releasePointer();
      return;
    }

    const dragState = dragStateRef.current;
    if (activeTool === "select" && dragState && point) {
      const rawDx = point.x - dragState.start.x;
      const rawDy = point.y - dragState.start.y;
      const { dx, dy } = clampDeltaForSnapshots(dragState.snapshots, rawDx, rawDy);
      applyDragDelta(dragState, dx, dy);
      dragStateRef.current = null;
      if (dx !== 0 || dy !== 0) {
        setStatus(`${dragState.snapshots.length} aree spostate`);
        markDirty();
        bumpRevision();
      }
      releasePointer();
      return;
    }

    if (activeTool === "select" && dragState) {
      dragStateRef.current = null;
      redrawMasks();
      releasePointer();
    }
  }

  function getVisibleStageCenterAnchor() {
    const shell = canvasShellRef.current;
    const stage = stageRef.current;
    if (!shell || !stage) return undefined;

    const shellRect = shell.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const left = Math.max(shellRect.left, stageRect.left);
    const right = Math.min(shellRect.right, stageRect.right);
    const top = Math.max(shellRect.top, stageRect.top);
    const bottom = Math.min(shellRect.bottom, stageRect.bottom);

    if (right > left && bottom > top) {
      return {
        clientX: left + (right - left) / 2,
        clientY: top + (bottom - top) / 2,
      };
    }

    return {
      clientX: shellRect.left + shellRect.width / 2,
      clientY: shellRect.top + shellRect.height / 2,
    };
  }

  function getWheelZoomAnchor(event: globalThis.WheelEvent) {
    const stage = stageRef.current;
    if (!stage) return { clientX: event.clientX, clientY: event.clientY };

    const rect = stage.getBoundingClientRect();
    const isInsideStage =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (isInsideStage) return { clientX: event.clientX, clientY: event.clientY };
    return getVisibleStageCenterAnchor() ?? { clientX: event.clientX, clientY: event.clientY };
  }

  function updateZoom(nextZoom: number, anchor?: { clientX: number; clientY: number }) {
    const runtime = runtimeRef.current;
    const clampedZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(nextZoom * 10) / 10));
    const shell = canvasShellRef.current;
    const stage = stageRef.current;
    const anchorState =
      anchor && shell && stage
        ? (() => {
            const rect = stage.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;
            return {
              clientX: anchor.clientX,
              clientY: anchor.clientY,
              x: Math.max(0, Math.min(1, (anchor.clientX - rect.left) / rect.width)),
              y: Math.max(0, Math.min(1, (anchor.clientY - rect.top) / rect.height)),
            };
          })()
        : null;

    if (Math.abs(runtime.zoom * 100 - clampedZoom) < 0.05) return;

    runtime.zoom = clampedZoom / 100;
    setZoomPercent(clampedZoom);
    if (runtime.pdfDoc) {
      applyStageSize();
      if (anchorState && shell && stage) {
        const rect = stage.getBoundingClientRect();
        shell.scrollLeft += rect.left + rect.width * anchorState.x - anchorState.clientX;
        shell.scrollTop += rect.top + rect.height * anchorState.y - anchorState.clientY;
      }
    }
  }

  function handleCanvasWheel(event: globalThis.WheelEvent) {
    if (!hasPdf || !event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    const normalizedDelta =
      event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * 100
          : event.deltaY;
    const boundedDelta = Math.max(-ZOOM_WHEEL_MAX_DELTA, Math.min(ZOOM_WHEEL_MAX_DELTA, normalizedDelta));
    const zoomFactor = Math.exp(-boundedDelta * ZOOM_WHEEL_SENSITIVITY);
    updateZoom(runtimeRef.current.zoom * 100 * zoomFactor, getWheelZoomAnchor(event));
  }

  function rotateSegment(
    segment: MeasureSegment,
    pageNumber: number,
    oldWidth: number,
    oldHeight: number,
    newWidth: number,
    newHeight: number,
    delta: PageRotation,
  ): MeasureSegment {
    if (segment.page !== pageNumber || delta === 0) return segment;
    return {
      ...segment,
      start: rotateCanvasPoint(segment.start, oldWidth, oldHeight, newWidth, newHeight, delta),
      end: rotateCanvasPoint(segment.end, oldWidth, oldHeight, newWidth, newHeight, delta),
    };
  }

  function rotateCalibration(
    value: SavedCalibration,
    pageNumber: number,
    oldWidth: number,
    oldHeight: number,
    newWidth: number,
    newHeight: number,
    delta: PageRotation,
  ): SavedCalibration {
    if (value.page !== pageNumber || delta === 0) return value;
    return {
      ...value,
      start: rotateCanvasPoint(value.start, oldWidth, oldHeight, newWidth, newHeight, delta),
      end: rotateCanvasPoint(value.end, oldWidth, oldHeight, newWidth, newHeight, delta),
    };
  }

  function rotateCurrentPageGeometry(
    pageNumber: number,
    oldWidth: number,
    oldHeight: number,
    newWidth: number,
    newHeight: number,
    delta: PageRotation,
  ) {
    if (delta === 0 || oldWidth <= 0 || oldHeight <= 0 || newWidth <= 0 || newHeight <= 0) return;
    const pageSelections = runtimeRef.current.selectionsByPage.get(pageNumber) ?? [];
    pageSelections.forEach((selection) => {
      const region = rotateRegion(selection.region, oldWidth, oldHeight, newWidth, newHeight, delta);
      selection.region = region;
      selection.totalPixels = newWidth * newHeight;
      selection.bitmap = createTintedCanvas(region, selection.color, selection.opacity);
      selection.polygon = selection.polygon?.map((point) =>
        rotateCanvasPoint(point, oldWidth, oldHeight, newWidth, newHeight, delta),
      );
    });

    setRulerSegment((segment) =>
      segment ? rotateSegment(segment, pageNumber, oldWidth, oldHeight, newWidth, newHeight, delta) : segment,
    );
    setRulerDraft((segment) =>
      segment ? rotateSegment(segment, pageNumber, oldWidth, oldHeight, newWidth, newHeight, delta) : segment,
    );
    setCalibration((value) =>
      value ? rotateCalibration(value, pageNumber, oldWidth, oldHeight, newWidth, newHeight, delta) : value,
    );
    setPolygonDraft((points) =>
      points.map((point) => rotateCanvasPoint(point, oldWidth, oldHeight, newWidth, newHeight, delta)),
    );
    setPointerPreview((point) =>
      point ? rotateCanvasPoint(point, oldWidth, oldHeight, newWidth, newHeight, delta) : point,
    );
    setMarqueeDraft(null);
    setHoverPolygonInsert(null);
    dragStateRef.current = null;
    marqueeDragRef.current = null;
    segmentDragRef.current = null;
    polygonEditDragRef.current = null;
    outlinePathCacheRef.current = new WeakMap();
  }

  async function rotateCurrentPage(delta: -90 | 90) {
    const runtime = runtimeRef.current;
    if (!runtime.pdfDoc || !currentPage || busy) return;
    const pdfCanvas = pdfCanvasRef.current;
    const oldWidth = pdfCanvas?.width ?? 0;
    const oldHeight = pdfCanvas?.height ?? 0;
    const previousRotation = runtime.pageRotations.get(currentPage) ?? 0;
    const nextRotation = normalizePageRotation(previousRotation + delta);
    const deltaRotation = normalizePageRotation(nextRotation - previousRotation);

    recordUndoState();
    runtime.pageRotations.set(currentPage, nextRotation);
    if (nextRotation === 0) runtime.pageRotations.delete(currentPage);

    const rendered = await renderPage(currentPage);
    if (!rendered) {
      if (previousRotation === 0) runtime.pageRotations.delete(currentPage);
      else runtime.pageRotations.set(currentPage, previousRotation);
      setStatus("Rotazione non riuscita");
      return;
    }

    const newWidth = pdfCanvasRef.current?.width ?? 0;
    const newHeight = pdfCanvasRef.current?.height ?? 0;
    rotateCurrentPageGeometry(currentPage, oldWidth, oldHeight, newWidth, newHeight, deltaRotation);
    redrawMasks();
    markDirty();
    setStatus(delta > 0 ? "Pagina ruotata a destra" : "Pagina ruotata a sinistra");
    bumpRevision();
  }

  function toggleToolSection(section: ToolSectionId) {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function toggleRightPanelSection(section: RightPanelSectionId) {
    setCollapsedRightSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function collapseAllAreas() {
    setCollapsedAreaIds(selectedAreas.map(({ selection }) => selection.id));
  }

  function expandAllAreas() {
    setCollapsedAreaIds([]);
  }

  function openPriceList(priceList: EditorPriceList | undefined = property.priceLists?.[0]) {
    if (!priceList?.downloadUrl) {
      setStatus(`Prezzario per ${property.comune} non ancora collegato`);
      return;
    }
    window.open(priceList.downloadUrl, "_blank", "noopener,noreferrer");
    setStatus(`Prezzario aperto: ${priceList.territoryName}`);
  }

  function changeActiveUsage(usageId: UsageId) {
    if (usageId === activeUsage) return;
    recordUndoState();
    setActiveUsage(usageId);
    if (usageId !== CUSTOM_USAGE_ID) setActiveCustomUsageId(null);
    const usage =
      usageId === CUSTOM_USAGE_ID
        ? usageFromCustomPreset(activeCustomUsage, customUsageLabel)
        : usageById(usageId);
    setStatus(
      usageId === CUSTOM_USAGE_ID && !activeCustomUsage && !normalizeCustomUsageLabel(customUsageLabel)
        ? "Crea o seleziona una destinazione custom"
        : `Destinazione d'uso: ${usage.label}`,
    );
    markDirty();
  }

  function updateTraceSetting(key: TuningKey, currentValue: number, nextValue: number) {
    if (currentValue === nextValue) return;
    recordUndoState();
    if (key === "threshold") setThreshold(nextValue);
    if (key === "inflate") setInflate(nextValue);
    if (key === "gap") setGap(nextValue);
    if (key === "dash") setDash(nextValue);
    invalidateWallMap();
    markDirty();
  }

  function updateWallInclusionRadius(nextValue: number | null) {
    const normalized = normalizeWallInclusionRadius(nextValue);
    if (normalized === wallInclusionRadius) return;
    recordUndoState();
    setWallInclusionRadius(normalized);
    setStatus(normalized === null ? "Inclusione muri in area: auto" : `Inclusione muri in area: ${normalized}px`);
    markDirty();
    bumpRevision();
  }

  function applyAreaTuningDefaults() {
    const alreadyDefault =
      threshold === SMART_TRACE_DEFAULTS.threshold &&
      inflate === SMART_TRACE_DEFAULTS.inflate &&
      gap === SMART_TRACE_DEFAULTS.gap &&
      dash === SMART_TRACE_DEFAULTS.dash &&
      wallInclusionRadius === SMART_TRACE_DEFAULTS.wallInclusionRadius;
    if (alreadyDefault) return;
    recordUndoState();
    setThreshold(SMART_TRACE_DEFAULTS.threshold);
    setInflate(SMART_TRACE_DEFAULTS.inflate);
    setGap(SMART_TRACE_DEFAULTS.gap);
    setDash(SMART_TRACE_DEFAULTS.dash);
    setWallInclusionRadius(SMART_TRACE_DEFAULTS.wallInclusionRadius);
    invalidateWallMap("Taratura aree ripristinata ai default");
    markDirty();
  }

  function applyNarrowAreaTuningPreset() {
    if (wallInclusionRadius === 1) return;
    recordUndoState();
    setWallInclusionRadius(1);
    setStatus("Preset prova applicato: area piu stretta");
    markDirty();
    bumpRevision();
  }

  function saveCurrentAreaTuningTrial() {
    const trial: AreaTuningTrial = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      createdAt: new Date().toISOString(),
      threshold,
      inflate,
      gap,
      dash,
      wallInclusionRadius,
      resolvedWallInclusionRadius,
    };
    setAreaTuningTrials((current) => {
      const next = [trial, ...current].slice(0, 8);
      saveAreaTuningTrials(property.id, next);
      return next;
    });
    setStatus("Prova taratura aree salvata");
  }

  function clearAreaTuningTrials() {
    setAreaTuningTrials([]);
    saveAreaTuningTrials(property.id, []);
    setStatus("Registro prove taratura svuotato");
  }

  async function toggleFocusMode() {
    const nextFocusMode = !focusMode;
    setFocusMode(nextFocusMode);
    if (nextFocusMode) {
      try {
        await editorRootRef.current?.requestFullscreen?.();
      } catch {
        // Focus mode still reduces the app chrome when browser fullscreen is unavailable.
      }
    } else if (document.fullscreenElement === editorRootRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        // Leaving fullscreen is best effort.
      }
    }
  }

  function commitScaleInput() {
    const parsed = parseNumberInput(scaleInputValue);
    if (parsed === null) {
      setScaleInputValue("");
      return null;
    }
    const nextScale = Math.min(20000, Math.max(20, Math.round(parsed)));
    const changed = nextScale !== scaleDenominator || scaleModalSheetSize !== sheetSize;
    if (changed) recordUndoState();
    setScaleDenominator(nextScale);
    setSheetSize(scaleModalSheetSize);
    if (changed) setScaleSource("USER");
    setScaleInputValue(String(nextScale));
    if (changed) markDirty();
    return nextScale;
  }

  function submitScaleModal() {
    const nextScale = commitScaleInput();
    if (!nextScale) {
      setStatus("Inserisci una scala valida");
      return;
    }
    setScaleModalOpen(false);
  }

  function restoreScaleInput() {
    setScaleInputValue(String(scaleDenominator));
  }

  function commitKnownSegmentInput(options: { recordHistory?: boolean } = {}) {
    const parsed = parseNumberInput(knownSegmentInputValue);
    if (parsed === null) {
      setKnownSegmentInputValue("");
      return null;
    }
    const nextMeters = Math.max(0.1, parsed);
    if (options.recordHistory !== false && nextMeters !== knownSegmentMeters) recordUndoState();
    setKnownSegmentMeters(nextMeters);
    setKnownSegmentInputValue(String(nextMeters));
    return nextMeters;
  }

  function restoreKnownSegmentInput() {
    setKnownSegmentInputValue(String(knownSegmentMeters));
  }

  function invalidateWallMap(nextStatus = "Parametri tracciamento aggiornati") {
    runtimeRef.current.wallMap = null;
    runtimeRef.current.wallKey = "";
    setStatus(nextStatus);
    bumpRevision();
  }

  function canUseActiveUsage() {
    if (activeUsage !== CUSTOM_USAGE_ID || activeCustomUsage || normalizeCustomUsageLabel(customUsageLabel)) return true;
    setStatus("Crea o seleziona una destinazione custom");
    bumpRevision();
    return false;
  }

  function selectTool(tool: EditorTool) {
    setActiveTool(tool);
    if (tool !== "polygon") {
      setPolygonDraft([]);
      setPointerPreview(null);
    }
    if (tool !== "select" && tool !== "polygon") {
      setSelectedPolygonVertex(null);
      setHoverPolygonInsert(null);
    }
    if (tool !== "ruler") {
      rulerDragRef.current = null;
      setRulerDraft(null);
    }
    if (tool === "select") setStatus("Seleziona aree, trascina o usa copia/incolla");
    if (tool === "smart") setStatus("Smart selection attiva");
    if (tool === "polygon") setStatus("Disegna i vertici del poligono");
    if (tool === "ruler") setStatus("Traccia una distanza tra due punti");
  }

  const topPriceLists = property.priceLists?.slice(0, 5) ?? [];

  const renderAreaUsageOptions = (orphanCustomLabel: string, orphanValue: string) => (
    <>
      <optgroup label="Predefinite">
        {FIXED_USAGES.map((usageOption) => (
          <option key={usageOption.id} value={`fixed:${usageOption.id}`}>
            {usageOption.label}
          </option>
        ))}
      </optgroup>
      {customUsages.length > 0 && (
        <optgroup label="Custom">
          {customUsages.map((preset) => (
            <option key={preset.id} value={`custom:${preset.id}`}>
              {preset.label}
            </option>
          ))}
        </optgroup>
      )}
      {orphanCustomLabel && <option value={orphanValue}>{orphanCustomLabel}</option>}
    </>
  );

  return (
    <main ref={editorRootRef} className={`plan-editor ${focusMode ? "focus-mode" : ""}`}>
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
            <span className={`draft-state ${dirty ? "unsaved" : savedAt ? "saved" : ""}`}>
              {dirty
                ? "Modifiche non salvate"
                : savedAt
                  ? `Bozza salvata ${new Date(savedAt).toLocaleString("it-IT")}`
                  : "Nessuna bozza salvata"}
            </span>
            {scaleExtractionLabel && (
              <span
                className={`scale-ai-state ${scaleExtractionJob?.status.toLowerCase() ?? "running"}`}
                title={
                  scaleExtractionJob?.evidence
                    ? `${scaleExtractionLabel}: ${scaleExtractionJob.evidence}`
                    : scaleExtractionLabel
                }
              >
                <Sparkles size={15} />
                {scaleExtractionLabel}
              </span>
            )}
            <button className="button secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={17} />
              Carica planimetria
            </button>
            <div className="editor-map-actions" aria-label={`Apri indirizzo ${propertyLocation(property)} in mappe`}>
              <span>Apri in</span>
              <button
                className="button secondary compact-button"
                type="button"
                disabled={!forMapsEntry}
                title={
                  forMapsEntry
                    ? "Apri particella in forMaps"
                    : "Provincia, comune, foglio o particella mancanti"
                }
                onClick={() => {
                  if (forMapsEntry) openEntriesInForMaps([forMapsEntry]);
                }}
              >
                <Building2 size={15} />
                ForMaps
              </button>
              <a className="button secondary compact-button" href={googleEarthUrl(property)} target="_blank" rel="noreferrer">
                <Globe size={15} />
                Earth
              </a>
              <a className="button secondary compact-button" href={googleMapsUrl(property)} target="_blank" rel="noreferrer">
                <MapPin size={15} />
                GMaps
              </a>
            </div>
            <button className="button primary" onClick={() => void saveDraft()} disabled={!canSaveDraft}>
              <FileText size={17} />
              Salva bozza
            </button>
            <button
              className="icon-button focus-toggle"
              type="button"
              onClick={() => void toggleFocusMode()}
              title={withShortcut(focusMode ? "Esci da focus" : "Focus editor", SHORTCUTS.focus)}
              aria-label={focusMode ? "Esci da focus" : "Focus editor"}
            >
              {focusMode ? <X size={18} /> : <Maximize2 size={18} />}
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

      <section
        className={`plan-editor-grid ${leftPanelOpen ? "" : "left-collapsed"} ${rightPanelOpen ? "" : "right-collapsed"}`}
      >
        {leftPanelOpen && (
          <aside className="plan-tool-panel" aria-label="Impostazioni planimetria">
          <div className="aside-panel-head">
            <strong>Impostazioni</strong>
            <button
              className="icon-button"
              onClick={() => setLeftPanelOpen(false)}
              title="Nascondi impostazioni"
              aria-label="Nascondi impostazioni"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          <section className={`tool-block ${collapsedSections.usage ? "collapsed" : ""}`}>
            <button className="tool-block-toggle" type="button" onClick={() => toggleToolSection("usage")}>
              <span className="tool-block-title">Destinazione d'uso</span>
              <span className="tool-block-meta" style={{ color: activeUsageOption.color }}>
                {activeUsageOption.shortLabel}
              </span>
              <ChevronDown className="tool-block-chevron" size={16} />
            </button>
            {!collapsedSections.usage && (
              <>
                <div className="usage-grid">
                  {FIXED_USAGES.map((usage, index) => (
                    <button
                      key={usage.id}
                      className={`usage-button ${activeUsage === usage.id ? "active" : ""}`}
                      style={{ "--usage-color": usage.color } as CSSProperties}
                      title={`${index + 1} - ${usage.label}`}
                      onClick={() => changeActiveUsage(usage.id)}
                    >
                      <span />
                      {usage.label}
                    </button>
                  ))}
                </div>
                <div className="custom-usage-manager">
                  <div className="custom-usage-head">
                    <span>Destinazioni custom</span>
                    <button type="button" onClick={createCustomUsagePreset}>
                      <Plus size={14} />
                      Nuova
                    </button>
                  </div>
                  {customUsages.length === 0 ? (
                    <div className="custom-usage-empty">Nessuna destinazione custom</div>
                  ) : (
                    <div className="custom-usage-list">
                      {customUsages.map((preset) => {
                        const isActive = activeUsage === CUSTOM_USAGE_ID && activeCustomUsageId === preset.id;
                        return (
                          <div key={preset.id} className={`custom-usage-row ${isActive ? "active" : ""}`}>
                            <button
                              type="button"
                              className="custom-usage-selector"
                              title={`Usa ${preset.label}`}
                              onClick={() => selectCustomUsagePreset(preset.id)}
                            >
                              <span style={{ background: preset.color }} />
                            </button>
                            <input
                              key={`${preset.id}-${preset.label}`}
                              type="text"
                              defaultValue={preset.label}
                              onFocus={() => selectCustomUsagePreset(preset.id)}
                              onBlur={(event) => {
                                if (!renameCustomUsagePreset(preset.id, event.currentTarget.value)) {
                                  event.currentTarget.value = preset.label;
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.currentTarget.blur();
                                if (event.key === "Escape") {
                                  event.currentTarget.value = preset.label;
                                  event.currentTarget.blur();
                                }
                              }}
                            />
                            <input
                              type="color"
                              value={preset.color}
                              title={`Colore ${preset.label}`}
                              onFocus={() => selectCustomUsagePreset(preset.id)}
                              onChange={(event) => changeCustomUsageColor(preset.id, event.target.value)}
                            />
                            <button
                              type="button"
                              className="custom-usage-remove"
                              title={`Elimina ${preset.label}`}
                              onClick={() => deleteCustomUsagePreset(preset.id)}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          <section className={`tool-block ${collapsedSections.planimetry ? "collapsed" : ""}`}>
            <button className="tool-block-toggle" type="button" onClick={() => toggleToolSection("planimetry")}>
              <span className="tool-block-title">Planimetria</span>
              <Layers size={18} />
              <ChevronDown className="tool-block-chevron" size={16} />
            </button>
            {!collapsedSections.planimetry && (
              <>
                {linkedRemotePlan && (
                  <div className="document-source-buttons">
                    <button
                      key={linkedRemotePlan.url}
                      className={documentSource?.kind === "remote" ? "active" : ""}
                      onClick={() => void loadRemotePlan(linkedRemotePlan.url, linkedRemotePlan.fileName)}
                    >
                      ERP
                    </button>
                  </div>
                )}
                <div className="loaded-doc">
                  <FileText size={18} />
                  <div>
                    <span>PDF aperto</span>
                    <strong>{fileName || "Nessun documento"}</strong>
                    {scaleExtractionJob && (
                      <small>
                        {scaleExtractionJob.status === "SUCCEEDED" && scaleExtractionJob.scale
                          ? `${scaleExtractionJob.scale.label} rilevata${
                              scaleExtractionJob.confidence !== null
                                ? ` - confidenza ${Math.round(scaleExtractionJob.confidence * 100)}%`
                                : ""
                            }`
                          : scaleExtractionJob.status === "FAILED"
                            ? scaleExtractionJob.errorMessage ?? "Scala AI non disponibile"
                            : "Analisi scala AI in corso"}
                      </small>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          <section className={`tool-block ${collapsedSections.smart ? "collapsed" : ""}`}>
            <button className="tool-block-toggle" type="button" onClick={() => toggleToolSection("smart")}>
              <span className="tool-block-title">Smart Selection</span>
              <MousePointer2 size={18} />
              <ChevronDown className="tool-block-chevron" size={16} />
            </button>
            {!collapsedSections.smart && (
              <>
                <label className="slider-field">
                  <span>Sensibilita linee {threshold}</span>
                  <input
                    type="range"
                    min={170}
                    max={252}
                    value={threshold}
                    onChange={(event) => updateTraceSetting("threshold", threshold, Number(event.target.value))}
                  />
                </label>
                <label className="slider-field">
                  <span>Spessore linee {inflate}</span>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={inflate}
                    onChange={(event) => updateTraceSetting("inflate", inflate, Number(event.target.value))}
                  />
                </label>
                <label className="slider-field">
                  <span>Chiusura gap {gap}</span>
                  <input
                    type="range"
                    min={0}
                    max={18}
                    value={gap}
                    onChange={(event) => updateTraceSetting("gap", gap, Number(event.target.value))}
                  />
                </label>
                <label className="slider-field">
                  <span>Ponte tratteggi {dash}</span>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={dash}
                    onChange={(event) => updateTraceSetting("dash", dash, Number(event.target.value))}
                  />
                </label>
              </>
            )}
          </section>
          </aside>
        )}

        <section className="plan-canvas-panel">
          <div className="canvas-toolbar">
            <div className="canvas-toolbar-controls">
              <button
                className="icon-button panel-toggle"
                onClick={() => setLeftPanelOpen((open) => !open)}
                title={leftPanelOpen ? "Nascondi impostazioni" : "Mostra impostazioni"}
                aria-label={leftPanelOpen ? "Nascondi impostazioni" : "Mostra impostazioni"}
                aria-expanded={leftPanelOpen}
              >
                {leftPanelOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              </button>
              <div className="tool-quickbar" aria-label="Strumenti rapidi">
                {TOOL_OPTIONS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    className={activeTool === tool.id ? "active" : ""}
                    onClick={() => selectTool(tool.id)}
                    title={withShortcut(tool.label, tool.shortcut)}
                    aria-label={tool.label}
                  >
                    {tool.icon}
                  </button>
                ))}
              </div>
              {(activeTool === "ruler" || rulerSegment) && (
                <div className={`measure-inline-card ${rulerSegmentSelected ? "selected" : ""}`}>
                  <button
                    type="button"
                    className={`mini-tool-button ${activeTool === "ruler" ? "active" : ""}`}
                    disabled={!hasPdf}
                    onClick={() => selectTool("ruler")}
                    title={withShortcut("Righello", SHORTCUTS.ruler)}
                  >
                    <Ruler size={15} />
                    Righello
                  </button>
                  <label>
                    <span>m</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={knownSegmentInputValue}
                      onChange={(event) => setKnownSegmentInputValue(event.target.value)}
                      onBlur={() => {
                        if (knownSegmentInputValue === "") restoreKnownSegmentInput();
                        else commitKnownSegmentInput();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="mini-tool-button"
                    disabled={!hasPdf || !rulerSegment}
                    onClick={applyCalibrationFromRuler}
                  >
                    Taratura
                  </button>
                  <strong>{rulerSegment ? `${areaFormatter.format(rulerDistanceMeters)} m` : "Nessun segmento"}</strong>
                </div>
              )}
            </div>
            <div className="canvas-toolbar-meta">
              <div className="canvas-edit-actions">
                <button
                  className="icon-button"
                  title={withShortcut("Indietro", SHORTCUTS.undo)}
                  disabled={!canUndo || busy}
                  onClick={undoSelectionEdit}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  className="icon-button"
                  title={withShortcut("Avanti", SHORTCUTS.redo)}
                  disabled={!canRedo || busy}
                  onClick={redoSelectionEdit}
                >
                  <Redo2 size={17} />
                </button>
                <div className="delete-split-control">
                  <button
                    className="icon-button danger-icon"
                    title={withShortcut("Cancella elemento selezionato", SHORTCUTS.delete)}
                    disabled={!canDeleteSelectedObject || busy}
                    onClick={deleteSelectedObjects}
                  >
                    <Trash2 size={17} />
                  </button>
                  <button
                    className="icon-button danger-icon split-chevron"
                    title="Altre azioni di cancellazione"
                    disabled={!hasCurrentPageAreas || busy}
                    onClick={() => setDeleteMenuOpen((open) => !open)}
                    aria-expanded={deleteMenuOpen}
                  >
                    <ChevronDown size={15} />
                  </button>
                  {deleteMenuOpen && (
                    <div className="delete-menu" role="menu">
                      <button type="button" onClick={requestClearCurrentPage} disabled={!hasCurrentPageAreas}>
                        <Trash2 size={15} />
                        Cancella aree pagina
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <span>{canvasPixels}</span>
              {pageCount > 1 ? (
                <div className="page-stepper" aria-label="Navigazione pagine PDF">
                  <button
                    className="icon-button"
                    title="Pagina precedente"
                    disabled={!hasPdf || currentPage <= 1 || busy}
                    onClick={() => void renderPage(currentPage - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    {currentPage}/{pageCount}
                  </span>
                  <button
                    className="icon-button"
                    title="Pagina successiva"
                    disabled={!hasPdf || currentPage >= pageCount || busy}
                    onClick={() => void renderPage(currentPage + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              ) : (
                <span>Pagina {currentPage || 0}/{pageCount || 0}</span>
              )}
              <button
                className="canvas-scale-button"
                type="button"
                title="Modifica scala e formato foglio"
                onClick={() => {
                  setScaleInputValue(String(scaleDenominator));
                  setScaleModalSheetSize(sheetSize);
                  setScaleModalOpen(true);
                }}
              >
                {sheetSize} 1:{scaleDenominator}
              </button>
              <button
                className="icon-button panel-toggle"
                onClick={() => setRightPanelOpen((open) => !open)}
                title={rightPanelOpen ? "Nascondi riepilogo aree" : "Mostra riepilogo aree"}
                aria-label={rightPanelOpen ? "Nascondi riepilogo aree" : "Mostra riepilogo aree"}
                aria-expanded={rightPanelOpen}
              >
                {rightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              </button>
            </div>
          </div>
          <div ref={canvasShellRef} className="plan-canvas-shell">
            {!hasPdf && (
              <div className="plan-empty-state">
                <FileText size={30} />
                <strong>Nessuna planimetria aperta</strong>
                <button className="button secondary compact-button" type="button" onClick={addManualAreaRow}>
                  <Plus size={15} />
                  Aggiungi area manuale
                </button>
              </div>
            )}
            <div className="plan-stage-wrap">
              <div
                ref={stageRef}
                className={`plan-stage tool-${activeTool} ${busy ? "is-busy" : ""} ${!hasPdf ? "is-hidden" : ""}`}
                onPointerDown={onStagePointerDown}
                onPointerMove={onStagePointerMove}
                onPointerUp={onStagePointerUp}
              >
                <canvas ref={pdfCanvasRef} />
                <canvas ref={maskCanvasRef} />
                <canvas ref={waveCanvasRef} />
              </div>
            </div>
          </div>
          <div className={`canvas-zoom-dock ${opacityDockOpen ? "opacity-open" : ""}`} aria-label="Vista planimetria">
            <div className="canvas-zoom-row">
              <button
                className="icon-button"
                title={withShortcut("Riduci zoom", SHORTCUTS.zoomOut)}
                disabled={!hasPdf || zoomPercent <= ZOOM_MIN}
                onClick={() => updateZoom(zoomPercent - ZOOM_BUTTON_STEP, getVisibleStageCenterAnchor())}
              >
                <ZoomOut size={17} />
              </button>
              <label title={withShortcut("Zoom planimetria", SHORTCUTS.wheelZoom)}>
                <span>{zoomPercent}%</span>
                <input
                  type="range"
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  step={ZOOM_SLIDER_STEP}
                  value={zoomPercent}
                  onChange={(event) => updateZoom(Number(event.target.value), getVisibleStageCenterAnchor())}
                />
              </label>
              <button
                className="icon-button"
                title={withShortcut("Aumenta zoom", SHORTCUTS.zoomIn)}
                disabled={!hasPdf || zoomPercent >= ZOOM_MAX}
                onClick={() => updateZoom(zoomPercent + ZOOM_BUTTON_STEP, getVisibleStageCenterAnchor())}
              >
                <ZoomIn size={17} />
              </button>
              <button className="icon-button" title="Adatta alla vista" disabled={!hasPdf} onClick={fitPageToViewport}>
                <Maximize2 size={17} />
              </button>
              <button
                className="icon-button"
                title={withShortcut(`Ruota a sinistra (${currentPageRotation} gradi)`, SHORTCUTS.rotateLeft)}
                disabled={!hasPdf || busy}
                onClick={() => void rotateCurrentPage(-90)}
              >
                <RotateCcw size={17} />
              </button>
              <button
                className="icon-button"
                title={withShortcut(`Ruota a destra (${currentPageRotation} gradi)`, SHORTCUTS.rotateRight)}
                disabled={!hasPdf || busy}
                onClick={() => void rotateCurrentPage(90)}
              >
                <RotateCw size={17} />
              </button>
              <button
                className={`icon-button canvas-dock-toggle ${opacityDockOpen ? "active" : ""}`}
                title="Opacita"
                aria-label="Opacita"
                aria-expanded={opacityDockOpen}
                onClick={() => setOpacityDockOpen((open) => !open)}
              >
                <Layers size={17} />
              </button>
            </div>
            {opacityDockOpen && (
              <label className="canvas-opacity-row">
                <span>Opacita {opacityPercent}%</span>
                <input
                  type="range"
                  min={15}
                  max={75}
                  value={opacityPercent}
                  onChange={(event) => updateMaskOpacity(Number(event.target.value))}
                />
              </label>
            )}
          </div>
          <section className={`area-table-dock ${areaTableCollapsed ? "collapsed" : ""}`} aria-label="Tabella aree selezionate">
            <button
              className="area-table-dock-toggle"
              type="button"
              onClick={() => setAreaTableCollapsed((collapsed) => !collapsed)}
              aria-expanded={!areaTableCollapsed}
            >
              <span>Aree selezionate</span>
              <strong>{selectedSelectionIds.length}/{selectedAreas.length}</strong>
              <ChevronDown size={16} />
            </button>
            {!areaTableCollapsed && (
              <div className="area-table-dock-content">
                <div className="area-table-actions">
                  <button className="button secondary compact-button" type="button" onClick={addManualAreaRow}>
                    <Plus size={15} />
                    Aggiungi riga manuale
                  </button>
                  <button
                    className="icon-button"
                    title={withShortcut("Copia aree selezionate", SHORTCUTS.copy)}
                    disabled={selectedSelections.length === 0}
                    onClick={copySelectedSelections}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title={withShortcut("Incolla aree copiate", SHORTCUTS.paste)}
                    disabled={clipboardCount === 0 || !hasPdf}
                    onClick={pasteCopiedSelections}
                  >
                    <ClipboardPaste size={16} />
                  </button>
                  <button
                    className="button secondary compact-button"
                    disabled={selectedCurrentPageSelections.length < 2}
                    onClick={mergeSelectedSelections}
                  >
                    <Combine size={15} />
                    Unisci
                  </button>
                  <button
                    className="icon-button danger-icon"
                    title={withShortcut("Cancella elemento selezionato", SHORTCUTS.delete)}
                    disabled={selectedSelectionIds.length === 0 && !rulerSegmentSelected}
                    onClick={deleteSelectedObjects}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="area-table-scroll">
                  {selectedAreas.length === 0 ? (
                    <div className="areas-empty compact">
                      <MousePointer2 size={20} />
                      <strong>Nessuna area</strong>
                    </div>
                  ) : (
                    <table className="area-selection-table">
                      <thead>
                        <tr>
                          <th>Sel.</th>
                          <th>Area</th>
                          <th>Tipologia</th>
                          <th>Nome custom</th>
                          <th>Superficie</th>
                          <th>Valore</th>
                          <th>Stima</th>
                          <th>Pixel</th>
                          <th>Colore</th>
                          <th>Opacita</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAreas.map(
                          ({
                            selection,
                            index,
                            usage,
                            area,
                            calculatedArea,
                            amount,
                            calculatedAmount,
                            areaOverridden,
                            amountOverridden,
                          }) => {
                            const selectedCustomPreset = selectionCustomUsagePreset(selection);
                            const orphanCustomLabel =
                              selection.usageId === CUSTOM_USAGE_ID && !selectedCustomPreset
                                ? normalizeCustomUsageLabel(selection.customUsageLabel) || "Custom"
                                : "";
                            return (
                              <tr
                                key={selection.id}
                                className={selectedSelectionIds.includes(selection.id) ? "selected" : ""}
                              >
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={selectedSelectionIds.includes(selection.id)}
                                    onChange={() =>
                                      setSelectedSelectionIds((current) =>
                                        current.includes(selection.id)
                                          ? current.filter((id) => id !== selection.id)
                                          : [...current, selection.id],
                                      )
                                    }
                                    aria-label={`Seleziona area ${index + 1}`}
                                  />
                                </td>
                                <td>
                                  <span className="area-table-name">
                                    <i style={{ background: usage.color }} />
                                    <strong>Area {index + 1}</strong>
                                    <small>{selection.source === "manual" ? "manuale" : `pag. ${selection.page}`}</small>
                                  </span>
                                </td>
                                <td>
                                  <div className="area-table-usage-cell">
                                    <select
                                      value={selectionUsageChoiceValue(selection)}
                                      onChange={(event) => changeSelectionUsageChoice(selection.id, event.target.value)}
                                    >
                                      {renderAreaUsageOptions(orphanCustomLabel, `orphan:${selection.id}`)}
                                    </select>
                                    <button
                                      type="button"
                                      className="icon-button"
                                      title="Crea nuova destinazione custom per questa area"
                                      onClick={() => createCustomUsageForSelection(selection.id)}
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                </td>
                                <td>
                                  {selection.usageId === CUSTOM_USAGE_ID ? (
                                    <input
                                      key={`${selection.id}-table-${selection.customUsageId ?? "orphan"}-${usage.label}`}
                                      className="area-table-text-input"
                                      type="text"
                                      defaultValue={usage.label}
                                      onBlur={(event) => {
                                        if (!renameSelectionCustomUsage(selection.id, event.currentTarget.value)) {
                                          event.currentTarget.value = usage.label;
                                        }
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        if (event.key === "Escape") {
                                          event.currentTarget.value = usage.label;
                                          event.currentTarget.blur();
                                        }
                                      }}
                                    />
                                  ) : (
                                    <span className="area-table-muted">-</span>
                                  )}
                                </td>
                                <td>
                                  <div className="area-table-value-cell">
                                    <input
                                      key={`${selection.id}-table-area-${area}`}
                                      className="area-value-input"
                                      type="text"
                                      inputMode="decimal"
                                      defaultValue={String(areaFormatter.format(area))}
                                      onBlur={(event) => {
                                        const nextArea = changeSelectionAreaOverride(
                                          selection.id,
                                          event.currentTarget.value,
                                          calculatedArea,
                                        );
                                        event.currentTarget.value = areaFormatter.format(nextArea ?? area);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        if (event.key === "Escape") {
                                          event.currentTarget.value = areaFormatter.format(area);
                                          event.currentTarget.blur();
                                        }
                                      }}
                                    />
                                    <span className="area-value-unit">m2</span>
                                    {areaOverridden && <span className="manual-override-badge">Manuale</span>}
                                    {areaOverridden && (
                                      <button
                                        type="button"
                                        className="inline-reset-button"
                                        onClick={() => clearSelectionAreaOverride(selection.id)}
                                      >
                                        Annulla
                                      </button>
                                    )}
                                    {areaOverridden && <small>Calc. {formatM2(calculatedArea)}</small>}
                                  </div>
                                </td>
                                <td>
                                  <div className="area-table-value-cell compact">
                                    <input
                                      key={`${selection.id}-table-rate-${selection.rate}`}
                                      className="area-value-input"
                                      type="text"
                                      inputMode="decimal"
                                      defaultValue={String(selection.rate).replace(".", ",")}
                                      onBlur={(event) => {
                                        const nextRate = changeSelectionRate(selection.id, event.currentTarget.value);
                                        event.currentTarget.value = String(nextRate ?? selection.rate).replace(".", ",");
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        if (event.key === "Escape") {
                                          event.currentTarget.value = String(selection.rate).replace(".", ",");
                                          event.currentTarget.blur();
                                        }
                                      }}
                                    />
                                    <span className="area-value-unit">€/m2</span>
                                  </div>
                                </td>
                                <td>
                                  <div className="area-table-estimate-cell">
                                    <strong>{moneyFormatter.format(amount)}</strong>
                                    {amountOverridden && <span className="manual-override-badge">Manuale</span>}
                                    {amountOverridden && (
                                      <button
                                        type="button"
                                        className="inline-reset-button"
                                        onClick={() => clearSelectionAmountOverride(selection.id)}
                                      >
                                        Annulla
                                      </button>
                                    )}
                                    {amountOverridden && <small>Calc. {moneyFormatter.format(calculatedAmount)}</small>}
                                  </div>
                                </td>
                                <td>{selection.source === "manual" ? "-" : selection.region.count.toLocaleString("it-IT")}</td>
                                <td>
                                  <input
                                    className="area-table-color-input"
                                    type="color"
                                    value={selection.color}
                                    onChange={(event) => changeSelectionColor(selection.id, event.target.value)}
                                    aria-label={`Colore area ${index + 1}`}
                                  />
                                </td>
                                <td>
                                  <label className="area-table-opacity">
                                    <span>{Math.round(selection.opacity * 100)}%</span>
                                    <input
                                      type="range"
                                      min={5}
                                      max={100}
                                      value={Math.round(selection.opacity * 100)}
                                      onChange={(event) => changeSelectionOpacity(selection.id, Number(event.target.value))}
                                    />
                                  </label>
                                </td>
                                <td>
                                  <button
                                    className="icon-button danger-icon"
                                    type="button"
                                    title={withShortcut("Rimuovi area", SHORTCUTS.delete)}
                                    onClick={() => removeSelection(selection.id)}
                                  >
                                    <X size={15} />
                                  </button>
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </section>
          <details
            className="area-calibration-dock"
            open={areaCalibrationOpen}
            onToggle={(event) => setAreaCalibrationOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                <Ruler size={16} />
                Strumento taratura aree
              </span>
              <em>
                Bordo {wallInclusionRadius === null ? `auto ${resolvedWallInclusionRadius}px` : `${resolvedWallInclusionRadius}px`}
              </em>
              <ChevronDown size={15} />
            </summary>
            <div className="area-calibration-content">
              <div className="area-calibration-baseline">
                <strong>Default attuali</strong>
                <span>
                  Sensibilita {SMART_TRACE_DEFAULTS.threshold} · Spessore {SMART_TRACE_DEFAULTS.inflate} · Gap{" "}
                  {SMART_TRACE_DEFAULTS.gap} · Tratteggi {SMART_TRACE_DEFAULTS.dash} · Bordo{" "}
                  {SMART_TRACE_DEFAULTS.wallInclusionRadius === null
                    ? `auto ${autoWallInclusionRadius(SMART_TRACE_DEFAULTS.inflate, SMART_TRACE_DEFAULTS.dash)}px`
                    : `${SMART_TRACE_DEFAULTS.wallInclusionRadius}px`}
                </span>
              </div>
              <div className="area-tuning-grid">
                <label className="area-tuning-field">
                  <span>Sensibilita linee {threshold}</span>
                  <input
                    type="range"
                    min={170}
                    max={252}
                    value={threshold}
                    onChange={(event) => updateTraceSetting("threshold", threshold, Number(event.target.value))}
                  />
                </label>
                <label className="area-tuning-field">
                  <span>Spessore linee {inflate}</span>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    value={inflate}
                    onChange={(event) => updateTraceSetting("inflate", inflate, Number(event.target.value))}
                  />
                </label>
                <label className="area-tuning-field">
                  <span>Chiusura gap {gap}</span>
                  <input
                    type="range"
                    min={0}
                    max={18}
                    value={gap}
                    onChange={(event) => updateTraceSetting("gap", gap, Number(event.target.value))}
                  />
                </label>
                <label className="area-tuning-field">
                  <span>Ponte tratteggi {dash}</span>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={dash}
                    onChange={(event) => updateTraceSetting("dash", dash, Number(event.target.value))}
                  />
                </label>
                <label className="area-tuning-field area-tuning-field-wide">
                  <span>
                    Inclusione muri area{" "}
                    {wallInclusionRadius === null
                      ? `auto ${resolvedWallInclusionRadius}px`
                      : `${resolvedWallInclusionRadius}px`}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    value={resolvedWallInclusionRadius}
                    onChange={(event) => updateWallInclusionRadius(Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="area-tuning-wall-row">
                <button
                  type="button"
                  className={wallInclusionRadius === null ? "active" : ""}
                  onClick={() => updateWallInclusionRadius(null)}
                >
                  Auto
                </button>
                <small>0 non aggiunge pixel muro alla regione; auto replica il comportamento precedente.</small>
              </div>
              <div className="area-tuning-actions">
                <button type="button" className="button secondary compact-button" onClick={applyNarrowAreaTuningPreset}>
                  Area piu stretta
                </button>
                <button type="button" className="button secondary compact-button" onClick={applyAreaTuningDefaults}>
                  Ripristina default
                </button>
                <button type="button" className="button primary compact-button" onClick={saveCurrentAreaTuningTrial}>
                  Salva prova
                </button>
              </div>
              <div className="area-tuning-trials">
                <div className="area-tuning-trials-head">
                  <strong>Prove salvate</strong>
                  {areaTuningTrials.length > 0 && (
                    <button type="button" onClick={clearAreaTuningTrials}>
                      Svuota
                    </button>
                  )}
                </div>
                {areaTuningTrials.length === 0 ? (
                  <span>Nessuna prova salvata</span>
                ) : (
                  areaTuningTrials.map((trial) => (
                    <div key={trial.id} className="area-tuning-trial-row">
                      <time>{new Date(trial.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time>
                      <span>
                        S {trial.threshold} · I {trial.inflate} · G {trial.gap} · T {trial.dash} · Bordo{" "}
                        {trial.wallInclusionRadius === null ? `auto ${trial.resolvedWallInclusionRadius}px` : `${trial.wallInclusionRadius}px`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </details>
        </section>

        {rightPanelOpen && (
          <aside className="areas-panel" aria-label="Riepilogo aree">
          <div className="aside-panel-head">
            <strong>Riepilogo aree</strong>
            <button
              className="icon-button"
              onClick={() => setRightPanelOpen(false)}
              title="Nascondi riepilogo aree"
              aria-label="Nascondi riepilogo aree"
            >
              <PanelRightClose size={18} />
            </button>
          </div>
          <details
            className="editor-price-list-dropdown"
            open={priceListDropdownOpen}
            onToggle={(event) => setPriceListDropdownOpen(event.currentTarget.open)}
          >
            <summary>
              <span>Prezzario</span>
              <ChevronDown className="dropdown-chevron" size={16} />
            </summary>
            {topPriceLists.length > 0 ? (
              <section className="editor-price-list-panel" aria-label="Prezzari rilevanti">
                <div className="editor-price-list-header">
                  <strong>Prezzari rilevanti</strong>
                </div>
                <div className="editor-price-list-list">
                  {topPriceLists.map((priceList, index) => (
                    <button
                      key={priceList.id}
                      className={index === 0 ? "primary" : ""}
                      type="button"
                      title={`${priceList.reason}${priceList.distanceKm ? ` - ${Math.round(priceList.distanceKm)} km` : ""}`}
                      onClick={() => openPriceList(priceList)}
                    >
                      <span className="price-list-rank">{priceList.rank}</span>
                      <span className="price-list-copy">
                        <strong>{priceList.territoryName}</strong>
                        <small>
                          {priceList.reason}
                          {priceList.distanceKm ? ` - ${Math.round(priceList.distanceKm)} km` : ""}
                        </small>
                      </span>
                      {priceList.year && <span className="price-list-year">{priceList.year}</span>}
                      <ExternalLink size={14} />
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <div className="editor-price-list-empty">Nessun prezzario collegato per {property.comune}</div>
            )}
          </details>
          <section className={`area-totals ${collapsedRightSections.totals ? "collapsed" : ""}`}>
            <button className="right-panel-toggle" type="button" onClick={() => toggleRightPanelSection("totals")}>
              <span>Riepilogo superfici</span>
              <ChevronDown size={16} />
            </button>
            {!collapsedRightSections.totals && (
              <div className="area-totals-content">
                <div>
                  <span>Area totale tracciata</span>
                  <strong>{formatM2(totals.area)}</strong>
                </div>
                <div>
                  <span>Stima prototipo aree</span>
                  <strong>{moneyFormatter.format(totals.amount)}</strong>
                  <small>Valori da validare</small>
                </div>
              </div>
            )}
          </section>

          <section className={`selected-areas-list ${collapsedRightSections.areas ? "collapsed" : ""}`}>
            <button className="right-panel-toggle" type="button" onClick={() => toggleRightPanelSection("areas")}>
              <span>Aree selezionate</span>
              <strong>{selectedSelectionIds.length}/{selectedAreas.length}</strong>
              <ChevronDown size={16} />
            </button>
            {!collapsedRightSections.areas && (
              <>
                <div className="selection-action-row">
                  <button
                    className="button secondary compact-button"
                    type="button"
                    onClick={addManualAreaRow}
                  >
                    <Plus size={15} />
                    Manuale
                  </button>
                  <button
                    className="icon-button"
                    title={withShortcut("Copia aree selezionate", SHORTCUTS.copy)}
                    disabled={selectedSelections.length === 0}
                    onClick={copySelectedSelections}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title={withShortcut("Incolla aree copiate", SHORTCUTS.paste)}
                    disabled={clipboardCount === 0 || !hasPdf}
                    onClick={pasteCopiedSelections}
                  >
                    <ClipboardPaste size={16} />
                  </button>
                  <button
                    className={`icon-button area-toggle-all-button ${allAreasCollapsed ? "all-collapsed" : ""}`}
                    title={allAreasCollapsed ? "Espandi tutte le aree" : "Comprimi tutte le aree"}
                    disabled={selectedAreas.length === 0}
                    onClick={allAreasCollapsed ? expandAllAreas : collapseAllAreas}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    className="button secondary compact-button"
                    disabled={selectedCurrentPageSelections.length < 2}
                    onClick={mergeSelectedSelections}
                  >
                    <Combine size={15} />
                    Unisci
                  </button>
                  <button
                    className="icon-button danger-icon"
                    title={withShortcut("Cancella elemento selezionato", SHORTCUTS.delete)}
                    disabled={selectedSelectionIds.length === 0 && !rulerSegmentSelected}
                    onClick={deleteSelectedObjects}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="areas-scroll-list">
                  {selectedAreas.length === 0 ? (
                    <div className="areas-empty">
                      <MousePointer2 size={22} />
                      <strong>Nessuna area</strong>
                    </div>
                  ) : (
                    selectedAreas.map(({ selection, index, usage, area, calculatedArea, amount, calculatedAmount, areaOverridden, amountOverridden }) => {
                      const areaCollapsed = collapsedAreaIds.includes(selection.id);
                      const selectedCustomPreset = selectionCustomUsagePreset(selection);
                      const orphanCustomLabel =
                        selection.usageId === CUSTOM_USAGE_ID && !selectedCustomPreset
                          ? normalizeCustomUsageLabel(selection.customUsageLabel) || "Custom"
                          : "";
                      return (
                        <article
                          key={selection.id}
                          className={`area-row ${selectedSelectionIds.includes(selection.id) ? "selected" : ""} ${areaCollapsed ? "collapsed" : ""}`}
                        >
                          <div
                            className="area-row-head"
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setCollapsedAreaIds((current) =>
                                current.includes(selection.id)
                                  ? current.filter((id) => id !== selection.id)
                                  : [...current, selection.id],
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setCollapsedAreaIds((current) =>
                                  current.includes(selection.id)
                                    ? current.filter((id) => id !== selection.id)
                                    : [...current, selection.id],
                                );
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedSelectionIds.includes(selection.id)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={() =>
                                setSelectedSelectionIds((current) =>
                                  current.includes(selection.id)
                                    ? current.filter((id) => id !== selection.id)
                                    : [...current, selection.id],
                                )
                              }
                              aria-label={`Seleziona area ${index + 1}`}
                            />
                            <span style={{ background: usage.color }} />
                            <div className="area-row-title">
                              <strong>
                                Area {index + 1} - {selection.source === "manual" ? "manuale" : `pagina ${selection.page}`}
                              </strong>
                              {areaCollapsed && (
                                <em>
                                  {formatCompactM2(area)}
                                  {areaOverridden ? " - manuale" : ""}
                                </em>
                              )}
                            </div>
                            <button
                              title={withShortcut("Rimuovi area", SHORTCUTS.delete)}
                              onClick={(event) => {
                                event.stopPropagation();
                                removeSelection(selection.id);
                              }}
                            >
                              <X size={15} />
                            </button>
                          </div>
                          {!areaCollapsed && (
                            <>
                              <div className="area-usage-editor" onClick={(event) => event.stopPropagation()}>
                                <select
                                  value={selectionUsageChoiceValue(selection)}
                                  onChange={(event) => changeSelectionUsageChoice(selection.id, event.target.value)}
                                >
                                  <optgroup label="Predefinite">
                                    {FIXED_USAGES.map((usageOption) => (
                                      <option key={usageOption.id} value={`fixed:${usageOption.id}`}>
                                        {usageOption.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                  {customUsages.length > 0 && (
                                    <optgroup label="Custom">
                                      {customUsages.map((preset) => (
                                        <option key={preset.id} value={`custom:${preset.id}`}>
                                          {preset.label}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {orphanCustomLabel && (
                                    <option value={`orphan:${selection.id}`}>{orphanCustomLabel}</option>
                                  )}
                                </select>
                                <button
                                  type="button"
                                  className="icon-button"
                                  title="Crea nuova destinazione custom per questa area"
                                  onClick={() => createCustomUsageForSelection(selection.id)}
                                >
                                  <Plus size={15} />
                                </button>
                              </div>
                              {selection.usageId === CUSTOM_USAGE_ID && (
                                <label className="area-custom-name-field" onClick={(event) => event.stopPropagation()}>
                                  <span>Nome custom</span>
                                  <input
                                    key={`${selection.id}-${selection.customUsageId ?? "orphan"}-${usage.label}`}
                                    type="text"
                                    defaultValue={usage.label}
                                    onBlur={(event) => {
                                      if (!renameSelectionCustomUsage(selection.id, event.currentTarget.value)) {
                                        event.currentTarget.value = usage.label;
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") event.currentTarget.blur();
                                      if (event.key === "Escape") {
                                        event.currentTarget.value = usage.label;
                                        event.currentTarget.blur();
                                      }
                                    }}
                                  />
                                </label>
                              )}
                              <dl>
                                <div>
                                  <dt>Area</dt>
                                  <dd className="area-override-cell">
                                    <input
                                      key={`${selection.id}-area-${area}`}
                                      className="area-value-input"
                                      type="text"
                                      inputMode="decimal"
                                      defaultValue={String(areaFormatter.format(area))}
                                      onClick={(event) => event.stopPropagation()}
                                      onBlur={(event) => {
                                        const nextArea = changeSelectionAreaOverride(selection.id, event.currentTarget.value, calculatedArea);
                                        event.currentTarget.value = areaFormatter.format(nextArea ?? area);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        if (event.key === "Escape") {
                                          event.currentTarget.value = areaFormatter.format(area);
                                          event.currentTarget.blur();
                                        }
                                      }}
                                    />
                                    <span className="area-value-unit">m2</span>
                                    {areaOverridden && <span className="manual-override-badge">Manuale</span>}
                                    {areaOverridden && (
                                      <button
                                        type="button"
                                        className="inline-reset-button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          clearSelectionAreaOverride(selection.id);
                                        }}
                                      >
                                        Annulla
                                      </button>
                                    )}
                                    {areaOverridden && <small>Calcolata: {formatM2(calculatedArea)}</small>}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Valore</dt>
                                  <dd>
                                    <input
                                      key={`${selection.id}-${selection.rate}`}
                                      className="area-value-input"
                                      type="text"
                                      inputMode="decimal"
                                      defaultValue={String(selection.rate).replace(".", ",")}
                                      onClick={(event) => event.stopPropagation()}
                                      onBlur={(event) => {
                                        const nextRate = changeSelectionRate(selection.id, event.currentTarget.value);
                                        event.currentTarget.value = String(nextRate ?? selection.rate).replace(".", ",");
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                        if (event.key === "Escape") {
                                          event.currentTarget.value = String(selection.rate).replace(".", ",");
                                          event.currentTarget.blur();
                                        }
                                      }}
                                    />
                                    <span className="area-value-unit">€/m2</span>
                                  </dd>
                                </div>
                                <div>
                                  <dt>Stima</dt>
                                  <dd className="area-override-cell">
                                    <strong>{moneyFormatter.format(amount)}</strong>
                                    {amountOverridden && <span className="manual-override-badge">Manuale</span>}
                                    {amountOverridden && (
                                      <button
                                        type="button"
                                        className="inline-reset-button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          clearSelectionAmountOverride(selection.id);
                                        }}
                                      >
                                        Annulla
                                      </button>
                                    )}
                                    {amountOverridden && <small>Calcolata: {moneyFormatter.format(calculatedAmount)}</small>}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Pixel</dt>
                                  <dd>{selection.source === "manual" ? "-" : selection.region.count.toLocaleString("it-IT")}</dd>
                                </div>
                              </dl>
                              <div className="area-visual-controls" onClick={(event) => event.stopPropagation()}>
                                <label className="area-color-field">
                                  <span>Colore</span>
                                  <input
                                    type="color"
                                    value={selection.color}
                                    onChange={(event) => changeSelectionColor(selection.id, event.target.value)}
                                  />
                                </label>
                                <label className="area-opacity-field">
                                  <span>Opacita {Math.round(selection.opacity * 100)}%</span>
                                  <input
                                    type="range"
                                    min={5}
                                    max={100}
                                    value={Math.round(selection.opacity * 100)}
                                    onChange={(event) => changeSelectionOpacity(selection.id, Number(event.target.value))}
                                  />
                                </label>
                              </div>
                            </>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </section>

          <section className={`usage-breakdown ${collapsedRightSections.breakdown ? "collapsed" : ""}`}>
            <button className="right-panel-toggle" type="button" onClick={() => toggleRightPanelSection("breakdown")}>
              <span>Ripartizione</span>
              <ChevronDown size={16} />
            </button>
            {!collapsedRightSections.breakdown &&
              usageBreakdown.map(({ usage, area }) => (
                <div key={`${usage.id}-${usage.shortLabel}`} className="usage-breakdown-row">
                  <span style={{ background: usage.color }} />
                  <strong>{usage.shortLabel}</strong>
                  <em>{formatCompactM2(area)}</em>
                </div>
              ))}
          </section>
          </aside>
        )}
      </section>

      {scaleModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setScaleModalOpen(false)}>
          <div className="editor-modal scale-modal" role="dialog" aria-modal="true" aria-labelledby="scale-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2 id="scale-modal-title">Scala planimetria</h2>
              <button className="icon-button" type="button" onClick={() => setScaleModalOpen(false)} aria-label="Chiudi">
                <X size={18} />
              </button>
            </div>
            <label className="scale-field">
              <span>Rapporto di scala</span>
              <div>
                <strong>1:</strong>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={scaleInputValue}
                  onChange={(event) => setScaleInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitScaleModal();
                    if (event.key === "Escape") setScaleModalOpen(false);
                  }}
                />
              </div>
            </label>
            <div className="modal-sheet-section">
              <span>Formato foglio</span>
              <div className="sheet-toggle" role="group" aria-label="Formato foglio">
                {(["A3", "A4"] as SheetSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={scaleModalSheetSize === size ? "active" : ""}
                    onClick={() => setScaleModalSheetSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="calibration-card scale-preview-card">
              <span>Area reale foglio</span>
              <strong>{formatM2(pageRealAreaM2(scaleModalSheetSize, scaleModalPreviewScale))}</strong>
            </div>
            {calibration && (
              <div className="calibration-segment-info">
                <span>Taratura attiva</span>
                <strong>
                  {areaFormatter.format(calibration.knownMeters)} m {"->"} 1:{calibration.scaleDenominator}
                </strong>
              </div>
            )}
            <p className="modal-note">La scala aggiorna subito il calcolo delle superfici gia tracciate.</p>
            <div className="modal-actions">
              <button
                className="button secondary scale-auto-button"
                type="button"
                disabled={!hasPdf || scaleExtractionBusy}
                onClick={() => void triggerCurrentPdfScaleExtraction()}
              >
                <Sparkles size={16} />
                {scaleExtractionBusy ? "Analisi in corso..." : "Rileva automaticamente"}
              </button>
              <button className="button secondary" type="button" onClick={() => setScaleModalOpen(false)}>
                Annulla
              </button>
              <button className="button primary" type="button" onClick={submitScaleModal}>
                Applica scala
              </button>
            </div>
          </div>
        </div>
      )}

      {clearPageConfirmOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setClearPageConfirmOpen(false)}>
          <div className="editor-modal danger-modal" role="dialog" aria-modal="true" aria-labelledby="clear-page-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2 id="clear-page-title">Cancellare le aree della pagina?</h2>
              <button className="icon-button" type="button" onClick={() => setClearPageConfirmOpen(false)} aria-label="Chiudi">
                <X size={18} />
              </button>
            </div>
            <p className="modal-note">
              Verranno rimosse tutte le aree tracciate nella pagina {currentPage}. Potrai recuperarle solo con Indietro finche resti nell'editor.
            </p>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setClearPageConfirmOpen(false)}>
                Annulla
              </button>
              <button className="button danger-button" type="button" onClick={confirmClearCurrentPage}>
                <Trash2 size={16} />
                Cancella aree pagina
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
