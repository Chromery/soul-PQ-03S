import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  CircleHelp,
  Clock3,
  ClipboardList,
  Copy,
  Download,
  Euro,
  ExternalLink,
  Factory,
  File,
  FileSpreadsheet,
  FileText,
  Globe,
  GripVertical,
  Home,
  MapPin,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Presentation,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import type { ImuValueSource, PropertyImuCalculation } from "./imu";
import {
  DEFAULT_EDITOR_PREFERENCES,
  type EditorPreferences,
  normalizeEditorPreferences,
  readEditorPreferences,
  resetEditorPreferences,
  writeEditorPreferences,
} from "./editorPreferences";
import { openEntriesInForMaps, toForMapsEntries, toForMapsEntry } from "./formaps";
import { lotValueForArea, normalizeLotValuation } from "./lotValuation";
import type { LotValuation, LotValuationMode } from "./lotValuation";
const PlanimetriaEditor = lazy(() => import("./PlanimetriaEditor"));
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";
const APP_DEPLOY_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.49.0";

type StudyStatus = "Da iniziare" | "In lavorazione" | "In revisione" | "Concluso";

type PropertyOutcome = "Positivo" | "Negativo" | "Neutro";

type PriceListItem = {
  id: string;
  title: string;
  fileName: string;
  territoryName: string;
  territoryScope: string;
  comune?: string | null;
  provincia?: string | null;
  region?: string | null;
  year?: number | null;
  rank: number;
  score: number;
  reason: string;
  distanceKm?: number | null;
  downloadUrl: string;
};

type PropertyItem = {
  id: string;
  address: string;
  comune: string;
  provincia?: string | null;
  formapsComune?: string | null;
  formapsProvincia?: string | null;
  ubicazione?: string | null;
  foglio?: string | null;
  particella?: string | null;
  subalterno?: string | null;
  sezioneCatastale?: string | null;
  codiceComuneCatastale?: string | null;
  formapsMunicipalityId?: string | null;
  categoria: string;
  titolarita?: string | null;
  currentRendita: number;
  estimatedRendita: number;
  diffPercent: number;
  currentImu?: number | null;
  estimatedImu?: number | null;
  imuDiff: number;
  imuRateOverride?: number | null;
  imuMultiplierOverride?: number | null;
  imuCalculation?: PropertyImuCalculation | null;
  currentImuCalculation?: PropertyImuCalculation | null;
  currentImuSource?: ImuValueSource;
  estimatedImuSource?: ImuValueSource;
  displayOrder?: number;
  outcome: PropertyOutcome;
  hasStudy: boolean;
  sheetSize?: PlanAreaSheetSize | null;
  scaleDenominator?: number | null;
  scaleSource?: PlanScaleSource | null;
  aiScaleDenominator?: number | null;
  aiScaleLabel?: string | null;
  aiSheetSize?: PlanAreaSheetSize | null;
  aiScaleConfidence?: number | null;
  aiScaleDetectedAt?: string | null;
  documents: {
    planimetria: string;
    visura: string;
    elencoSubalterni?: string;
  };
  documentUrls?: {
    planimetria?: string | null;
    visura?: string | null;
    elencoSubalterni?: string | null;
  };
  priceLists?: PriceListItem[];
};

type PropertyImuOverrideUpdate = {
  imuRateOverride: number | null;
  imuMultiplierOverride: number | null;
  currentImu: number | null;
  estimatedImu: number | null;
  imuDiff: number;
  currentImuCalculation: PropertyImuCalculation | null;
  imuCalculation: PropertyImuCalculation | null;
  currentImuSource: ImuValueSource;
  estimatedImuSource: ImuValueSource;
};

type FeasibilityStudy = {
  id: string;
  company: string;
  vat: string;
  comune: string;
  provincia: string;
  region: string;
  status: StudyStatus;
  createdAt: string;
  importedAt: string;
  concludedAt?: string;
  deadline: string;
  nextAppointment?: string;
  diffRendita: number;
  diffImu: number;
  originalRendita: number;
  totalRendita: number;
  catDRendita: number;
  commercialOwner: string;
  technicalOwner: string;
  notes: string;
  erpUrl: string;
  properties: PropertyItem[];
};

type PresentationDeck = {
  id: string;
  studyId: string;
  propertyIds: string[];
  propertyCount: number;
  fileName: string;
  createdAt: string;
  htmlUrl: string;
  pdfUrl: string;
};

type StudyUpdate = Partial<Pick<FeasibilityStudy, "status" | "notes">>;

type NewStudyFormState = {
  company: string;
  vat: string;
  comune: string;
  provincia: string;
  region: string;
  deadline: string;
  notes: string;
};

type NewPropertyFormState = {
  address: string;
  comune: string;
  provincia: string;
  region: string;
  categoria: string;
  foglio: string;
  particella: string;
  subalterno: string;
  titolarita: string;
  currentRendita: string;
  estimatedRendita: string;
  currentImu: string;
  estimatedImu: string;
};

type ComuneOption = {
  name: string;
  province: string;
  region: string;
  label: string;
  search: string;
};

type RawComuneRecord = {
  nome: string;
  sigla: string;
  regione?: {
    nome?: string;
  };
};

let comuneOptionsPromise: Promise<ComuneOption[]> | null = null;

async function loadComuneOptions() {
  if (!comuneOptionsPromise) {
    comuneOptionsPromise = import("comuni-json/comuni.json").then((module) => {
      const records = module.default as RawComuneRecord[];
      return records.map((record) => {
        const region = normalizeRegionName(record.regione?.nome ?? "");
        return {
          name: record.nome,
          province: record.sigla,
          region,
          label: `${record.nome} (${record.sigla}) - ${region}`,
          search: normalizeComuneSearch(`${record.nome} ${record.sigla} ${region}`),
        };
      });
    });
  }
  return comuneOptionsPromise;
}

function normalizeRegionName(value: string) {
  return value.split("/")[0].replace(/\s+/g, " ").trim();
}

function normalizeComuneSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findComuneOption(options: ComuneOption[], value: string) {
  const normalized = normalizeComuneSearch(value);
  if (!normalized) return null;
  return options.find((option) => normalizeComuneSearch(option.name) === normalized || normalizeComuneSearch(option.label) === normalized) ?? null;
}

type SystemBackupInfo = {
  fileName: string;
  localPath: string;
  sizeBytes: number;
  createdAt: string;
  remoteKey: string;
  uploaded: boolean;
};

type SystemStatus = {
  generatedAt: string;
  environment: string;
  database: {
    connected: boolean;
    studies: number;
    properties: number;
    documents: number;
    priceLists: number;
    planDrafts: number;
  };
  storage: {
    provider: string;
    configured: boolean;
    endpoint: string | null;
    endpointHost: string | null;
    region: string;
    bucket: string | null;
    keyPrefix: string;
    backupRemotePrefix: string;
    forcePathStyle: boolean;
    accessKeyConfigured: boolean;
    secretKeyConfigured: boolean;
  };
  backup: {
    configured: boolean;
    running: boolean;
    localDir: string;
    schedule: {
      timeLocal: string;
      timezone: string;
      retentionDays: number;
    };
    latest: SystemBackupInfo | null;
  };
  integrations: {
    erpSyncTokenConfigured: boolean;
    openRouterConfigured: boolean;
    neuralwattConfigured: boolean;
    neuralwattModel: string;
    scaleModel: string;
    visuraModel: string;
    pdfEngine: string;
    authentication: string;
  };
};

type SortKey =
  | "id"
  | "createdAt"
  | "importedAt"
  | "concludedAt"
  | "deadline"
  | "nextAppointment"
  | "diffRendita"
  | "diffImu"
  | "appointment"
  | "originalRendita"
  | "totalRendita"
  | "propertiesCount"
  | "commercialOwner"
  | "technicalOwner";

type PropertySortKey =
  | "manual"
  | "ubicazione"
  | "foglio"
  | "particella"
  | "subalterno"
  | "categoria"
  | "currentRendita"
  | "estimatedRendita"
  | "renditaDiff"
  | "currentImu"
  | "estimatedImu"
  | "imuDiff"
  | "titolarita"
  | "outcome";

type PlanAreaUsageId =
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

type PlanAreaSheetSize = "A3" | "A4";
type PlanScaleSource = "DEFAULT" | "AI" | "USER" | "CALIBRATION";

type PlanAreaDraft = {
  version: 1;
  propertyId: string;
  document: {
    kind: "sample" | "upload" | "remote";
    fileName: string;
    url?: string;
  } | null;
  savedAt: string;
  sheetSize: PlanAreaSheetSize;
  scaleDenominator: number;
  scaleSource?: PlanScaleSource;
  aiScaleDenominator?: number | null;
  aiScaleLabel?: string | null;
  aiSheetSize?: PlanAreaSheetSize | null;
  aiScaleConfidence?: number | null;
  aiScaleDetectedAt?: string | null;
  activeCustomUsageId?: string | null;
  customUsages?: PlanAreaCustomUsage[];
  customUsageLabel?: string;
  totalArea?: number;
  totalEstimatedAmount?: number;
  totalEstimatedRendita?: number;
  totalBaseAmount?: number;
  totalLotArea?: number;
  totalLotValue?: number;
  lotValuation?: LotValuation;
  estimatedImu?: number | null;
  imuCalculation?: PropertyImuCalculation | null;
  selections: PlanAreaDraftSelection[];
};

type PlanAreaDraftSelection = {
  id: string;
  page: number;
  usageId: PlanAreaUsageId;
  customUsageId?: string;
  customUsageLabel?: string;
  color?: string;
  rate?: number;
  areaOverrideM2?: number | null;
  amountOverride?: number | null;
  includedInLot?: boolean;
  opacity: number;
  totalPixels: number;
  source?: "smart" | "polygon" | "merged" | "copy" | "manual";
  region: {
    count: number;
  };
};

type PlanAreaCustomUsage = {
  id: string;
  label: string;
  color: string;
  rate: number;
};

type PlanAreaDraftState = {
  draft: PlanAreaDraft | null;
  loading: boolean;
  source: "database" | "local" | "none";
  error: boolean;
};

type AppRoute =
  | { view: "dashboard" }
  | { view: "studies" }
  | { view: "properties" }
  | { view: "analysis" }
  | { view: "report" }
  | { view: "settings" }
  | { view: "activity" }
  | { view: "study"; studyId: string }
  | { view: "editor"; studyId: string; propertyId: string };

function routeFromLocation(): AppRoute {
  const params = new URLSearchParams(window.location.search);
  const legacyStudyId = params.get("editorStudy");
  const legacyPropertyId = params.get("editorProperty");
  if (legacyStudyId && legacyPropertyId) {
    return { view: "editor", studyId: legacyStudyId, propertyId: legacyPropertyId };
  }

  const parts = window.location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { view: "dashboard" };
  if (parts[0] === "studi" && parts.length === 1) return { view: "studies" };
  if (parts[0] === "studi" && parts[1] && parts.length === 2) {
    return { view: "study", studyId: parts[1] };
  }
  if (parts[0] === "studi" && parts[1] && parts[2] === "immobili" && parts[3] && parts[4] === "planimetria") {
    return { view: "editor", studyId: parts[1], propertyId: parts[3] };
  }
  if (parts[0] === "immobili") return { view: "properties" };
  if (parts[0] === "analisi") return { view: "analysis" };
  if (parts[0] === "report") return { view: "report" };
  if (parts[0] === "impostazioni") return { view: "settings" };
  if (parts[0] === "attivita") return { view: "activity" };
  return { view: "dashboard" };
}

function pathForRoute(route: AppRoute) {
  switch (route.view) {
    case "dashboard":
      return "/";
    case "studies":
      return "/studi";
    case "properties":
      return "/immobili";
    case "analysis":
      return "/analisi";
    case "report":
      return "/report";
    case "settings":
      return "/impostazioni";
    case "activity":
      return "/attivita";
    case "study":
      return `/studi/${encodeURIComponent(route.studyId)}`;
    case "editor":
      return `/studi/${encodeURIComponent(route.studyId)}/immobili/${encodeURIComponent(route.propertyId)}/planimetria`;
  }
}

function navSectionForRoute(route: AppRoute) {
  switch (route.view) {
    case "dashboard":
    case "study":
    case "studies":
      return "Studi di fattibilità";
    case "editor":
    case "properties":
      return "Immobili";
    case "analysis":
      return "Analisi";
    case "report":
      return "Report";
    case "settings":
      return "Impostazioni";
    case "activity":
      return "";
  }
}

const demoStudies: FeasibilityStudy[] = [
  {
    id: "S-2026-0187",
    company: "Immobiliare Aurora Srl",
    vat: "IT04719350962",
    comune: "Milano",
    provincia: "MI",
    region: "Lombardia",
    status: "Concluso",
    createdAt: "2026-04-29",
    importedAt: "2026-05-05T09:15:00",
    concludedAt: "2026-05-04",
    deadline: "2026-05-24",
    nextAppointment: "2026-05-07T11:00:00",
    diffRendita: 34.2,
    diffImu: 11840,
    originalRendita: 18304.9,
    totalRendita: 24568.9,
    catDRendita: 16940,
    commercialOwner: "Marco Giordani",
    technicalOwner: "Elena Riva",
    notes:
      "Fattibilità confermata per gli immobili produttivi. Aggiornamento documentale richiesto per due subalterni.",
    erpUrl: "https://erp.soul.local/studi/S-2026-0187",
    properties: [
      {
        id: "AU-01",
        address: "Via Manzoni 12",
        comune: "Milano",
        categoria: "D/8",
        currentRendita: 1248.56,
        estimatedRendita: 1842.31,
        diffPercent: 47.6,
        imuDiff: 1320,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-au-01.pdf",
          visura: "visura-au-01.pdf",
        },
      },
      {
        id: "AU-02",
        address: "Via Manzoni 14",
        comune: "Milano",
        categoria: "D/1",
        currentRendita: 842.31,
        estimatedRendita: 1278.12,
        diffPercent: 51.7,
        imuDiff: 1085,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-au-02.pdf",
          visura: "visura-au-02.pdf",
        },
      },
      {
        id: "AU-03",
        address: "Via Verdi 8",
        comune: "Milano",
        categoria: "D/7",
        currentRendita: 1123.45,
        estimatedRendita: 1560,
        diffPercent: 38.8,
        imuDiff: 1198,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-au-03.pdf",
          visura: "visura-au-03.pdf",
        },
      },
      {
        id: "AU-04",
        address: "Via Torino 4",
        comune: "Sesto San Giovanni",
        categoria: "C/3",
        currentRendita: 780,
        estimatedRendita: 706,
        diffPercent: -9.5,
        imuDiff: -230,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-au-04.pdf",
          visura: "visura-au-04.pdf",
        },
      },
      {
        id: "AU-05",
        address: "Via Sempione 21",
        comune: "Pero",
        categoria: "D/8",
        currentRendita: 2240,
        estimatedRendita: 3075,
        diffPercent: 37.3,
        imuDiff: 2015,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-au-05.pdf",
          visura: "visura-au-05.pdf",
        },
      },
      {
        id: "AU-06",
        address: "Via Ortles 32",
        comune: "Milano",
        categoria: "C/2",
        currentRendita: 620,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-au-06.pdf",
          visura: "visura-au-06.pdf",
        },
      },
      {
        id: "AU-07",
        address: "Via Ripamonti 75",
        comune: "Milano",
        categoria: "D/1",
        currentRendita: 1880,
        estimatedRendita: 2412,
        diffPercent: 28.3,
        imuDiff: 1420,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-au-07.pdf",
          visura: "visura-au-07.pdf",
        },
      },
      {
        id: "AU-08",
        address: "Via Melchiorre Gioia 71",
        comune: "Milano",
        categoria: "D/8",
        currentRendita: 1990,
        estimatedRendita: 2668,
        diffPercent: 34.1,
        imuDiff: 1660,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-au-08.pdf",
          visura: "visura-au-08.pdf",
        },
      },
      {
        id: "AU-09",
        address: "Via Larga 6",
        comune: "Milano",
        categoria: "A/10",
        currentRendita: 910,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-au-09.pdf",
          visura: "visura-au-09.pdf",
        },
      },
      {
        id: "AU-10",
        address: "Via Monviso 9",
        comune: "Rho",
        categoria: "D/7",
        currentRendita: 1670,
        estimatedRendita: 2310,
        diffPercent: 38.3,
        imuDiff: 1550,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-au-10.pdf",
          visura: "visura-au-10.pdf",
        },
      },
      {
        id: "AU-11",
        address: "Via Padova 140",
        comune: "Milano",
        categoria: "D/8",
        currentRendita: 1840,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-au-11.pdf",
          visura: "visura-au-11.pdf",
        },
      },
      {
        id: "AU-12",
        address: "Via Tortona 27",
        comune: "Milano",
        categoria: "D/5",
        currentRendita: 1220,
        estimatedRendita: 1696,
        diffPercent: 39,
        imuDiff: 1262,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-au-12.pdf",
          visura: "visura-au-12.pdf",
        },
      },
    ],
  },
  {
    id: "S-2026-0186",
    company: "Green Stone Srl",
    vat: "IT03890160967",
    comune: "Monza",
    provincia: "MB",
    region: "Lombardia",
    status: "Da iniziare",
    createdAt: "2026-04-27",
    importedAt: "2026-05-05T09:10:00",
    deadline: "2026-05-31",
    nextAppointment: "2026-05-08T15:30:00",
    diffRendita: 12.3,
    diffImu: 3840,
    originalRendita: 11560,
    totalRendita: 12980,
    catDRendita: 7240,
    commercialOwner: "Anna Verdi",
    technicalOwner: "Luca Bellini",
    notes:
      "Da completare verifica categorie D/7 e D/8. Appuntamento commerciale già fissato.",
    erpUrl: "https://erp.soul.local/studi/S-2026-0186",
    properties: [
      {
        id: "GS-01",
        address: "Viale Lombardia 33",
        comune: "Monza",
        categoria: "D/7",
        currentRendita: 2540,
        estimatedRendita: 3120,
        diffPercent: 22.8,
        imuDiff: 1480,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-gs-01.pdf",
          visura: "visura-gs-01.pdf",
        },
      },
      {
        id: "GS-02",
        address: "Via Adda 18",
        comune: "Vimercate",
        categoria: "D/8",
        currentRendita: 1850,
        estimatedRendita: 1995,
        diffPercent: 7.8,
        imuDiff: 520,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-gs-02.pdf",
          visura: "visura-gs-02.pdf",
        },
      },
      {
        id: "GS-03",
        address: "Via Dante 9",
        comune: "Monza",
        categoria: "C/1",
        currentRendita: 940,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-gs-03.pdf",
          visura: "visura-gs-03.pdf",
        },
      },
      {
        id: "GS-04",
        address: "Via Ercole Marelli 2",
        comune: "Sesto San Giovanni",
        categoria: "D/1",
        currentRendita: 2260,
        estimatedRendita: 2680,
        diffPercent: 18.6,
        imuDiff: 1120,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-gs-04.pdf",
          visura: "visura-gs-04.pdf",
        },
      },
      {
        id: "GS-05",
        address: "Via Brianza 44",
        comune: "Lissone",
        categoria: "A/10",
        currentRendita: 640,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-gs-05.pdf",
          visura: "visura-gs-05.pdf",
        },
      },
      {
        id: "GS-06",
        address: "Via Volta 20",
        comune: "Agrate Brianza",
        categoria: "D/8",
        currentRendita: 1510,
        estimatedRendita: 1765,
        diffPercent: 16.9,
        imuDiff: 720,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-gs-06.pdf",
          visura: "visura-gs-06.pdf",
        },
      },
      {
        id: "GS-07",
        address: "Via Italia 78",
        comune: "Monza",
        categoria: "C/3",
        currentRendita: 520,
        estimatedRendita: 490,
        diffPercent: -5.8,
        imuDiff: -140,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-gs-07.pdf",
          visura: "visura-gs-07.pdf",
        },
      },
      {
        id: "GS-08",
        address: "Via Fermi 11",
        comune: "Villasanta",
        categoria: "D/8",
        currentRendita: 1300,
        estimatedRendita: 1510,
        diffPercent: 16.2,
        imuDiff: 600,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-gs-08.pdf",
          visura: "visura-gs-08.pdf",
        },
      },
      {
        id: "GS-09",
        address: "Via Lecco 5",
        comune: "Monza",
        categoria: "C/2",
        currentRendita: 440,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-gs-09.pdf",
          visura: "visura-gs-09.pdf",
        },
      },
      {
        id: "GS-10",
        address: "Via Stelvio 19",
        comune: "Monza",
        categoria: "D/7",
        currentRendita: 1560,
        estimatedRendita: 1810,
        diffPercent: 16,
        imuDiff: 640,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-gs-10.pdf",
          visura: "visura-gs-10.pdf",
        },
      },
    ],
  },
  {
    id: "S-2026-0185",
    company: "Abitare Insieme Spa",
    vat: "IT02984140156",
    comune: "Bergamo",
    provincia: "BG",
    region: "Lombardia",
    status: "In revisione",
    createdAt: "2026-04-24",
    importedAt: "2026-05-02T10:28:00",
    deadline: "2026-06-08",
    diffRendita: -5.1,
    diffImu: -960,
    originalRendita: 8652.2,
    totalRendita: 8210.45,
    catDRendita: 4210,
    commercialOwner: "Luca Bianchi",
    technicalOwner: "Elena Riva",
    notes:
      "Risultato preliminare sotto soglia. In revisione le superfici accessorie prima dell'esito.",
    erpUrl: "https://erp.soul.local/studi/S-2026-0185",
    properties: [
      {
        id: "AI-01",
        address: "Via Borgo Palazzo 90",
        comune: "Bergamo",
        categoria: "D/8",
        currentRendita: 2110,
        estimatedRendita: 2010,
        diffPercent: -4.7,
        imuDiff: -300,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-ai-01.pdf",
          visura: "visura-ai-01.pdf",
        },
      },
      {
        id: "AI-02",
        address: "Via Serassi 18",
        comune: "Bergamo",
        categoria: "D/1",
        currentRendita: 1680,
        estimatedRendita: 1605,
        diffPercent: -4.5,
        imuDiff: -260,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-ai-02.pdf",
          visura: "visura-ai-02.pdf",
        },
      },
      {
        id: "AI-03",
        address: "Via Moroni 42",
        comune: "Bergamo",
        categoria: "A/10",
        currentRendita: 780,
        estimatedRendita: 805,
        diffPercent: 3.2,
        imuDiff: 90,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-ai-03.pdf",
          visura: "visura-ai-03.pdf",
        },
      },
      {
        id: "AI-04",
        address: "Via Zanica 36",
        comune: "Bergamo",
        categoria: "C/2",
        currentRendita: 530,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-ai-04.pdf",
          visura: "visura-ai-04.pdf",
        },
      },
      {
        id: "AI-05",
        address: "Via Europa 4",
        comune: "Dalmine",
        categoria: "D/7",
        currentRendita: 1440,
        estimatedRendita: 1398,
        diffPercent: -2.9,
        imuDiff: -130,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-ai-05.pdf",
          visura: "visura-ai-05.pdf",
        },
      },
      {
        id: "AI-06",
        address: "Via San Bernardino 51",
        comune: "Bergamo",
        categoria: "D/8",
        currentRendita: 1630,
        estimatedRendita: 1562,
        diffPercent: -4.2,
        imuDiff: -210,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-ai-06.pdf",
          visura: "visura-ai-06.pdf",
        },
      },
      {
        id: "AI-07",
        address: "Via Corridoni 8",
        comune: "Bergamo",
        categoria: "C/3",
        currentRendita: 280,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-ai-07.pdf",
          visura: "visura-ai-07.pdf",
        },
      },
      {
        id: "AI-08",
        address: "Via Broseta 120",
        comune: "Bergamo",
        categoria: "A/10",
        currentRendita: 620,
        estimatedRendita: 575,
        diffPercent: -7.3,
        imuDiff: -150,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-ai-08.pdf",
          visura: "visura-ai-08.pdf",
        },
      },
    ],
  },
  {
    id: "S-2026-0184",
    company: "Nord Logistic Holding",
    vat: "IT09144070152",
    comune: "Brescia",
    provincia: "BS",
    region: "Lombardia",
    status: "In lavorazione",
    createdAt: "2026-04-23",
    importedAt: "2026-05-02T09:48:00",
    deadline: "2026-05-18",
    nextAppointment: "2026-05-06T09:45:00",
    diffRendita: 41.9,
    diffImu: 19850,
    originalRendita: 42110,
    totalRendita: 59748.2,
    catDRendita: 54220,
    commercialOwner: "Marco Giordani",
    technicalOwner: "Matteo Conti",
    notes:
      "Priorità alta per appuntamento imminente. Mancano due visure aggiornate da ERP.",
    erpUrl: "https://erp.soul.local/studi/S-2026-0184",
    properties: [
      {
        id: "NL-01",
        address: "Via Industriale 101",
        comune: "Brescia",
        categoria: "D/7",
        currentRendita: 12600,
        estimatedRendita: 17880,
        diffPercent: 41.9,
        imuDiff: 5900,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-nl-01.pdf",
          visura: "visura-nl-01.pdf",
        },
      },
      {
        id: "NL-02",
        address: "Via delle Acciaierie 5",
        comune: "Brescia",
        categoria: "D/8",
        currentRendita: 9040,
        estimatedRendita: 12800,
        diffPercent: 41.6,
        imuDiff: 4200,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-nl-02.pdf",
          visura: "visura-nl-02.pdf",
        },
      },
      {
        id: "NL-03",
        address: "Via Orzinuovi 62",
        comune: "Brescia",
        categoria: "D/1",
        currentRendita: 7420,
        estimatedRendita: 10220,
        diffPercent: 37.7,
        imuDiff: 3310,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-nl-03.pdf",
          visura: "visura-nl-03.pdf",
        },
      },
      {
        id: "NL-04",
        address: "Via Ghislandi 12",
        comune: "Brescia",
        categoria: "D/7",
        currentRendita: 8640,
        estimatedRendita: 12640,
        diffPercent: 46.3,
        imuDiff: 4720,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-nl-04.pdf",
          visura: "visura-nl-04.pdf",
        },
      },
      {
        id: "NL-05",
        address: "Via Serenissima 42",
        comune: "Brescia",
        categoria: "C/2",
        currentRendita: 1420,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-nl-05.pdf",
          visura: "visura-nl-05.pdf",
        },
      },
      {
        id: "NL-06",
        address: "Via Corsica 86",
        comune: "Brescia",
        categoria: "D/8",
        currentRendita: 13600,
        estimatedRendita: 18400,
        diffPercent: 35.3,
        imuDiff: 5320,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-nl-06.pdf",
          visura: "visura-nl-06.pdf",
        },
      },
    ],
  },
  {
    id: "S-2026-0183",
    company: "Tecno Valves Italia Srl",
    vat: "IT04471820980",
    comune: "Bologna",
    provincia: "BO",
    region: "Emilia-Romagna",
    status: "In lavorazione",
    createdAt: "2026-04-21",
    importedAt: "2026-04-30T11:04:00",
    deadline: "2026-06-15",
    diffRendita: 18.7,
    diffImu: 5460,
    originalRendita: 21780,
    totalRendita: 25852.86,
    catDRendita: 18320,
    commercialOwner: "Sara Ricci",
    technicalOwner: "Matteo Conti",
    notes:
      "Analisi superfici in corso. Da verificare destinazione d'uso su fabbricato principale.",
    erpUrl: "https://erp.soul.local/studi/S-2026-0183",
    properties: [
      {
        id: "TV-01",
        address: "Via del Lavoro 9",
        comune: "Bologna",
        categoria: "D/1",
        currentRendita: 5320,
        estimatedRendita: 6420,
        diffPercent: 20.7,
        imuDiff: 1490,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-tv-01.pdf",
          visura: "visura-tv-01.pdf",
        },
      },
      {
        id: "TV-02",
        address: "Via Fossa Cava 4",
        comune: "Casalecchio di Reno",
        categoria: "D/7",
        currentRendita: 4860,
        estimatedRendita: 5800,
        diffPercent: 19.3,
        imuDiff: 1280,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-tv-02.pdf",
          visura: "visura-tv-02.pdf",
        },
      },
      {
        id: "TV-03",
        address: "Via Roveri 16",
        comune: "Bologna",
        categoria: "D/8",
        currentRendita: 6180,
        estimatedRendita: 7180,
        diffPercent: 16.2,
        imuDiff: 1420,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-tv-03.pdf",
          visura: "visura-tv-03.pdf",
        },
      },
      {
        id: "TV-04",
        address: "Via Zamboni 2",
        comune: "Bologna",
        categoria: "A/10",
        currentRendita: 860,
        estimatedRendita: 0,
        diffPercent: 0,
        imuDiff: 0,
        outcome: "Neutro",
        hasStudy: false,
        documents: {
          planimetria: "planimetria-tv-04.pdf",
          visura: "visura-tv-04.pdf",
        },
      },
      {
        id: "TV-05",
        address: "Via Emilia Ponente 220",
        comune: "Bologna",
        categoria: "D/8",
        currentRendita: 4560,
        estimatedRendita: 5120,
        diffPercent: 12.3,
        imuDiff: 880,
        outcome: "Positivo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-tv-05.pdf",
          visura: "visura-tv-05.pdf",
        },
      },
    ],
  },
  {
    id: "S-2026-0182",
    company: "Riviera Retail Park Srl",
    vat: "IT03392060405",
    comune: "Rimini",
    provincia: "RN",
    region: "Emilia-Romagna",
    status: "Concluso",
    createdAt: "2026-04-18",
    importedAt: "2026-04-29T16:22:00",
    concludedAt: "2026-05-02",
    deadline: "2026-05-29",
    diffRendita: -11.8,
    diffImu: -4320,
    originalRendita: 36620,
    totalRendita: 32298.84,
    catDRendita: 21480,
    commercialOwner: "Anna Verdi",
    technicalOwner: "Giulia Ferri",
    notes:
      "Studio chiuso con esito negativo. Le planimetrie disponibili non confermano incremento utile.",
    erpUrl: "https://erp.soul.local/studi/S-2026-0182",
    properties: [
      {
        id: "RR-01",
        address: "Via Flaminia 128",
        comune: "Rimini",
        categoria: "D/8",
        currentRendita: 9200,
        estimatedRendita: 8080,
        diffPercent: -12.2,
        imuDiff: -1320,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-rr-01.pdf",
          visura: "visura-rr-01.pdf",
        },
      },
      {
        id: "RR-02",
        address: "Via Circonvallazione 11",
        comune: "Rimini",
        categoria: "C/1",
        currentRendita: 4100,
        estimatedRendita: 3920,
        diffPercent: -4.4,
        imuDiff: -390,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-rr-02.pdf",
          visura: "visura-rr-02.pdf",
        },
      },
      {
        id: "RR-03",
        address: "Via Marecchiese 78",
        comune: "Rimini",
        categoria: "D/7",
        currentRendita: 7340,
        estimatedRendita: 6460,
        diffPercent: -12,
        imuDiff: -980,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-rr-03.pdf",
          visura: "visura-rr-03.pdf",
        },
      },
      {
        id: "RR-04",
        address: "Via Coriano 34",
        comune: "Rimini",
        categoria: "D/8",
        currentRendita: 8200,
        estimatedRendita: 7050,
        diffPercent: -14,
        imuDiff: -1480,
        outcome: "Negativo",
        hasStudy: true,
        documents: {
          planimetria: "planimetria-rr-04.pdf",
          visura: "visura-rr-04.pdf",
        },
      },
    ],
  },
];

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: "importedAt", label: "Data importazione ERP" },
  { value: "createdAt", label: "Data creazione" },
  { value: "concludedAt", label: "Data esito" },
  { value: "deadline", label: "Data scadenza" },
  { value: "nextAppointment", label: "Prossimo appuntamento" },
  { value: "diffRendita", label: "Differenza rendita" },
  { value: "diffImu", label: "Differenza IMU" },
  { value: "appointment", label: "Appuntamento presente" },
  { value: "originalRendita", label: "Rendita originale totale" },
  { value: "propertiesCount", label: "Numero immobili" },
  { value: "commercialOwner", label: "Commerciale" },
  { value: "technicalOwner", label: "Responsabile tecnico" },
];

const statusOptions: Array<StudyStatus | "Tutti"> = [
  "Tutti",
  "Da iniziare",
  "In lavorazione",
  "In revisione",
  "Concluso",
];

const editableStatusOptions: StudyStatus[] = [
  "Da iniziare",
  "In lavorazione",
  "In revisione",
  "Concluso",
];

const propertyOutcomeOptions: PropertyOutcome[] = ["Positivo", "Negativo", "Neutro"];

const titolaritaOptions = [
  "Proprietà per 1/1",
  "Proprietà per quota",
  "Nuda proprietà",
  "Usufrutto",
  "Superficie",
  "Enfiteusi",
  "Uso",
  "Abitazione",
  "Locazione / conduzione",
  "Altro",
];

function titolaritaLookupKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const titolaritaPresetLookup = new Map(titolaritaOptions.map((option) => [titolaritaLookupKey(option), option]));

function getPresetTitolarita(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return titolaritaPresetLookup.get(titolaritaLookupKey(trimmed)) ?? null;
}

function formatTitolarita(value: string | null | undefined, fallback = "In attesa ERP") {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return getPresetTitolarita(trimmed) ?? trimmed;
}

const planAreaUsages: Array<{
  id: PlanAreaUsageId;
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
  { id: "lotto", label: "Lotto (legacy)", shortLabel: "Lotto legacy", color: "#64748b", rate: 0.2 },
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

const PLAN_AREA_CUSTOM_USAGE_ID: PlanAreaUsageId = "custom";
const planAreaSelectableUsages = planAreaUsages.filter((usage) => usage.id !== "lotto");

const planAreaSheetSizes: Record<PlanAreaSheetSize, { widthMm: number; heightMm: number }> = {
  A3: { widthMm: 420, heightMm: 297 },
  A4: { widthMm: 297, heightMm: 210 },
};

const PLAN_AREA_FRUITFULNESS_RATE = 0.02;

const PLAN_AREA_DRAFT_KEY_PREFIX = "soul-planimetria-draft:";

const euroFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

const numberFormatter = new Intl.NumberFormat("it-IT");

const areaFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatEuro(value: number) {
  return euroFormatter.format(value);
}

function formatDate(value?: string) {
  if (!value) return "Non concluso";
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value?: string) {
  if (!value) return "Non fissato";
  return dateTimeFormatter.format(new Date(value));
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function futureDateInput(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

function initialNewStudyForm(): NewStudyFormState {
  return {
    company: "",
    vat: "",
    comune: "",
    provincia: "",
    region: "",
    deadline: futureDateInput(30),
    notes: "",
  };
}

function initialNewPropertyForm(study: FeasibilityStudy): NewPropertyFormState {
  return {
    address: "",
    comune: study.comune,
    provincia: study.provincia,
    region: study.region,
    categoria: "D/7",
    foglio: "",
    particella: "",
    subalterno: "",
    titolarita: titolaritaOptions[0],
    currentRendita: "",
    estimatedRendita: "",
    currentImu: "",
    estimatedImu: "",
  };
}

function parseOptionalDecimalInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = Number(trimmed.replace(",", "."));
  return Number.isFinite(normalized) ? normalized : null;
}

function hasInvalidDecimalInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !Number.isFinite(Number(trimmed.replace(",", ".")));
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toLocaleString("it-IT", { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`;
}

function configuredLabel(value?: boolean) {
  return value ? "Configurato" : "Non configurato";
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatEstimatedValue(value: number | null | undefined) {
  return value === null || value === undefined || value === 0 ? "Da stimare" : formatEuro(value);
}

type PropertyDocumentKind = "planimetria" | "visura" | "elenco_subalterni";

function propertyDocumentField(type: PropertyDocumentKind) {
  return type === "elenco_subalterni" ? "elencoSubalterni" : type;
}

function propertyDocumentUrl(property: PropertyItem, type: PropertyDocumentKind) {
  return property.documentUrls?.[propertyDocumentField(type)] ?? "";
}

function propertyDocumentLabel(type: PropertyDocumentKind) {
  if (type === "planimetria") return "Elab. Planimetrico";
  if (type === "visura") return "Visura PDF";
  return "Elenco subalterni PDF";
}

function PropertyDocumentAvailability({
  property,
  compact = false,
}: {
  property: PropertyItem;
  compact?: boolean;
}) {
  const documents: Array<{ type: PropertyDocumentKind; label: string; shortLabel: string; icon: ReactNode }> = [
    { type: "planimetria", label: "Planimetria", shortLabel: "Plan.", icon: <File size={compact ? 11 : 13} /> },
    { type: "visura", label: "Visura", shortLabel: "Vis.", icon: <FileText size={compact ? 11 : 13} /> },
    { type: "elenco_subalterni", label: "Elenco subalterni", shortLabel: "Sub.", icon: <ClipboardList size={compact ? 11 : 13} /> },
  ];
  return (
    <div className={`document-availability ${compact ? "compact" : ""}`} aria-label="Disponibilità documenti">
      {documents.map((document) => {
        const available = Boolean(propertyDocumentUrl(property, document.type));
        return (
          <span
            key={document.type}
            className={`document-availability-item ${available ? "available" : "missing"}`}
            title={`${document.label}: ${available ? "disponibile" : "non disponibile"}`}
            aria-label={`${document.label} ${available ? "disponibile" : "non disponibile"}`}
          >
            {document.icon}
            {!compact && <span>{document.shortLabel}</span>}
            {available ? <CheckCircle2 size={compact ? 10 : 12} /> : <X size={compact ? 10 : 12} />}
          </span>
        );
      })}
    </div>
  );
}

function openPropertyDocument(
  property: PropertyItem,
  type: PropertyDocumentKind,
  onMissing: (message: string) => void,
) {
  const url = propertyDocumentUrl(property, type);
  if (!url) {
    onMissing(`${propertyDocumentLabel(type)} non disponibile nello storage documentale.`);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function openPriceListDocument(priceList: PriceListItem | undefined, onMissing: (message: string) => void) {
  if (!priceList?.downloadUrl) {
    onMissing("Nessun prezzario territoriale disponibile per questo immobile.");
    return;
  }
  window.open(priceList.downloadUrl, "_blank", "noopener,noreferrer");
}

function formatM2(value: number) {
  return `${areaFormatter.format(value)} m2`;
}

function parseLocalizedNumberInput(value: string) {
  const trimmed = value.trim().replace(/\s+/g, "");
  if (!trimmed) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function planAreaDraftKey(propertyId: string) {
  return `${PLAN_AREA_DRAFT_KEY_PREFIX}${propertyId}`;
}

function planAreaUsageById(id: string) {
  return planAreaUsages.find((usage) => usage.id === id) ?? planAreaUsages[0];
}

function planAreaUsageForSelection(selection: PlanAreaDraftSelection) {
  const usage = planAreaUsageById(selection.usageId);
  if (selection.usageId !== PLAN_AREA_CUSTOM_USAGE_ID) {
    return { ...usage, color: selection.color ?? usage.color };
  }
  const label = (selection.customUsageLabel ?? "").replace(/\s+/g, " ").trim() || usage.label;
  return {
    ...usage,
    label,
    shortLabel: label.length > 18 ? `${label.slice(0, 17)}...` : label,
    color: selection.color ?? usage.color,
  };
}

function planAreaSourceLabel(source?: PlanAreaDraftSelection["source"]) {
  if (source === "manual") return "Manuale";
  if (source === "polygon") return "Poligono";
  if (source === "merged") return "Unione";
  if (source === "copy") return "Copia";
  return "Smart";
}

function planScaleSourceLabel(source?: PlanScaleSource) {
  if (source === "AI") return "AI";
  if (source === "CALIBRATION") return "Righello";
  if (source === "USER") return "Manuale";
  return "Default";
}

function pageRealAreaM2(sheetSize: PlanAreaSheetSize, scaleDenominator: number) {
  const sheet = planAreaSheetSizes[sheetSize];
  const width = (sheet.widthMm / 1000) * scaleDenominator;
  const height = (sheet.heightMm / 1000) * scaleDenominator;
  return width * height;
}

function planAreaFromPixels(selection: PlanAreaDraftSelection, draft: PlanAreaDraft) {
  if (!selection.totalPixels) return 0;
  return (selection.region.count / selection.totalPixels) * pageRealAreaM2(draft.sheetSize, draft.scaleDenominator);
}

function planAreaEffectiveAreaM2(selection: PlanAreaDraftSelection, draft: PlanAreaDraft) {
  return typeof selection.areaOverrideM2 === "number" && Number.isFinite(selection.areaOverrideM2)
    ? selection.areaOverrideM2
    : planAreaFromPixels(selection, draft);
}

function planAreaEffectiveAmount(selection: PlanAreaDraftSelection, draft: PlanAreaDraft) {
  const usage = planAreaUsageForSelection(selection);
  const rate = selection.rate ?? usage.rate;
  const computedAmount = planAreaEffectiveAreaM2(selection, draft) * rate;
  return typeof selection.amountOverride === "number" && Number.isFinite(selection.amountOverride)
    ? selection.amountOverride
    : computedAmount;
}

function planAreaLotValue(selection: PlanAreaDraftSelection, draft: PlanAreaDraft) {
  return lotValueForArea(
    planAreaEffectiveAreaM2(selection, draft),
    planAreaEffectiveAmount(selection, draft),
    selection.includedInLot,
    normalizeLotValuation(draft.lotValuation),
  );
}

function planAreaTotalAmount(selection: PlanAreaDraftSelection, draft: PlanAreaDraft) {
  return planAreaEffectiveAmount(selection, draft) + planAreaLotValue(selection, draft);
}

function planAreaEstimatedRenditaFromAmount(amount: number) {
  return amount * PLAN_AREA_FRUITFULNESS_RATE;
}

function planAreaEstimatedRenditaFromDraft(draft: PlanAreaDraft) {
  if (typeof draft.totalEstimatedRendita === "number" && Number.isFinite(draft.totalEstimatedRendita)) {
    return draft.totalEstimatedRendita;
  }
  return typeof draft.totalEstimatedAmount === "number" && Number.isFinite(draft.totalEstimatedAmount)
    ? planAreaEstimatedRenditaFromAmount(draft.totalEstimatedAmount)
    : null;
}

function recalculatePlanAreaDraftTotals(draft: PlanAreaDraft): PlanAreaDraft {
  const totals = draft.selections.reduce(
    (acc, selection) => {
      const area = planAreaEffectiveAreaM2(selection, draft);
      const baseAmount = planAreaEffectiveAmount(selection, draft);
      const lotValue = planAreaLotValue(selection, draft);
      acc.area += area;
      acc.baseAmount += baseAmount;
      acc.lotArea += selection.includedInLot ? area : 0;
      acc.lotValue += lotValue;
      acc.amount += baseAmount + lotValue;
      return acc;
    },
    { area: 0, baseAmount: 0, lotArea: 0, lotValue: 0, amount: 0 },
  );
  return {
    ...draft,
    lotValuation: normalizeLotValuation(draft.lotValuation),
    totalArea: totals.area,
    totalBaseAmount: totals.baseAmount,
    totalLotArea: totals.lotArea,
    totalLotValue: totals.lotValue,
    totalEstimatedAmount: totals.amount,
    totalEstimatedRendita: planAreaEstimatedRenditaFromAmount(totals.amount),
  };
}

function clonePlanAreaDraft(draft: PlanAreaDraft): PlanAreaDraft {
  return JSON.parse(JSON.stringify(draft)) as PlanAreaDraft;
}

function planAreaUsageChoiceValue(selection: PlanAreaDraftSelection, draft: PlanAreaDraft) {
  if (selection.usageId !== PLAN_AREA_CUSTOM_USAGE_ID) return `fixed:${selection.usageId}`;
  if (selection.customUsageId && draft.customUsages?.some((customUsage) => customUsage.id === selection.customUsageId)) {
    return `custom:${selection.customUsageId}`;
  }
  return `orphan:${selection.id}`;
}

function handleNumericInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>, fallbackValue: string) {
  if (event.key === "Enter") event.currentTarget.blur();
  if (event.key === "Escape") {
    event.currentTarget.value = fallbackValue;
    event.currentTarget.blur();
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPlanAreaDraft(value: unknown, propertyId: string): value is PlanAreaDraft {
  if (!isObject(value)) return false;
  if (value.version !== 1 || value.propertyId !== propertyId) return false;
  if (value.sheetSize !== "A3" && value.sheetSize !== "A4") return false;
  if (typeof value.scaleDenominator !== "number" || !Number.isFinite(value.scaleDenominator)) return false;
  if (
    value.scaleSource !== undefined &&
    value.scaleSource !== "DEFAULT" &&
    value.scaleSource !== "AI" &&
    value.scaleSource !== "USER" &&
    value.scaleSource !== "CALIBRATION"
  ) {
    return false;
  }
  if (value.aiScaleDenominator !== undefined && value.aiScaleDenominator !== null) {
    if (typeof value.aiScaleDenominator !== "number" || !Number.isFinite(value.aiScaleDenominator)) return false;
  }
  if (value.aiSheetSize !== undefined && value.aiSheetSize !== null && value.aiSheetSize !== "A3" && value.aiSheetSize !== "A4") {
    return false;
  }
  if (value.aiScaleConfidence !== undefined && value.aiScaleConfidence !== null) {
    if (typeof value.aiScaleConfidence !== "number" || !Number.isFinite(value.aiScaleConfidence)) return false;
  }
  if (typeof value.savedAt !== "string" || Number.isNaN(new Date(value.savedAt).getTime())) return false;
  if (value.document !== null && (!isObject(value.document) || typeof value.document.fileName !== "string")) return false;
  if (!Array.isArray(value.selections)) return false;

  return value.selections.every((selection) => {
    if (!isObject(selection) || !isObject(selection.region)) return false;
    return (
      typeof selection.id === "string" &&
      typeof selection.page === "number" &&
      typeof selection.usageId === "string" &&
      typeof selection.opacity === "number" &&
      typeof selection.totalPixels === "number" &&
      typeof selection.region.count === "number"
    );
  });
}

function readLocalPlanAreaDraft(propertyId: string) {
  try {
    const serialized = window.localStorage.getItem(planAreaDraftKey(propertyId));
    if (!serialized) return null;
    const parsed = JSON.parse(serialized) as unknown;
    return isPlanAreaDraft(parsed, propertyId) ? parsed : null;
  } catch {
    return null;
  }
}

function usePlanAreaDraft(propertyId: string | null): [
  PlanAreaDraftState,
  (draft: PlanAreaDraft, source?: PlanAreaDraftState["source"], error?: boolean) => void,
] {
  const [state, setState] = useState<PlanAreaDraftState>({
    draft: null,
    loading: false,
    source: "none",
    error: false,
  });

  useEffect(() => {
    if (!propertyId) {
      setState({ draft: null, loading: false, source: "none", error: false });
      return;
    }

    const requestedPropertyId = propertyId;
    let disposed = false;
    const localDraft = readLocalPlanAreaDraft(requestedPropertyId);
    setState({
      draft: localDraft,
      loading: true,
      source: localDraft ? "local" : "none",
      error: false,
    });

    async function loadDraft() {
      try {
        const response = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(requestedPropertyId)}/analysis-draft`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as unknown;
        const databaseDraft = isPlanAreaDraft(payload, requestedPropertyId) ? payload : null;
        if (databaseDraft) {
          try {
            window.localStorage.setItem(planAreaDraftKey(requestedPropertyId), JSON.stringify(databaseDraft));
          } catch {
            // Database remains the source of truth when browser storage is full.
          }
        }
        const resolvedDraft =
          databaseDraft && localDraft && new Date(localDraft.savedAt) > new Date(databaseDraft.savedAt)
            ? localDraft
            : databaseDraft ?? localDraft;
        if (!disposed) {
          setState({
            draft: resolvedDraft,
            loading: false,
            source: resolvedDraft ? (resolvedDraft === databaseDraft ? "database" : "local") : "none",
            error: false,
          });
        }
      } catch {
        if (!disposed) {
          setState({
            draft: localDraft,
            loading: false,
            source: localDraft ? "local" : "none",
            error: true,
          });
        }
      }
    }

    void loadDraft();

    return () => {
      disposed = true;
    };
  }, [propertyId]);

  function updateDraft(draft: PlanAreaDraft, source: PlanAreaDraftState["source"] = "database", error = false) {
    setState({ draft, loading: false, source, error });
  }

  return [state, updateDraft];
}

function propertyLocation(property: PropertyItem) {
  const comune = property.comune ? `${property.comune}${property.provincia ? ` (${property.provincia})` : ""}` : "";
  return property.ubicazione || [property.address, comune].filter(Boolean).join(", ") || property.id;
}

function deviationPercent(current: number | null | undefined, estimated: number | null | undefined) {
  if (current === null || current === undefined || estimated === null || estimated === undefined || current === 0) {
    return null;
  }
  return ((estimated - current) / current) * 100;
}

function propertyRenditaDiffAmount(property: PropertyItem) {
  if (!property.hasStudy && property.estimatedRendita <= 0) return null;
  return property.estimatedRendita - property.currentRendita;
}

function propertyRenditaDiffPercent(property: PropertyItem) {
  if (!property.hasStudy && property.estimatedRendita <= 0) return null;
  return deviationPercent(property.currentRendita, property.estimatedRendita) ?? property.diffPercent;
}

function propertyImuDiffAmount(property: PropertyItem) {
  if (property.currentImu === null || property.currentImu === undefined || property.estimatedImu === null || property.estimatedImu === undefined) {
    return null;
  }
  return property.estimatedImu - property.currentImu;
}

function propertyImuDiffPercent(property: PropertyItem) {
  return deviationPercent(property.currentImu, property.estimatedImu);
}

function studyRenditaDiffAmount(study: FeasibilityStudy) {
  const computed = study.totalRendita - study.originalRendita;
  return Number.isFinite(computed) ? computed : study.diffRendita;
}

function studyRenditaDiffPercent(study: FeasibilityStudy) {
  return deviationPercent(study.originalRendita, study.totalRendita);
}

function studyImuDiffPercent(study: FeasibilityStudy) {
  const currentTotal = study.properties.reduce((total, property) => total + (property.currentImu ?? 0), 0);
  const estimatedProperties = study.properties.filter((property) => property.estimatedImu !== null && property.estimatedImu !== undefined);
  if (estimatedProperties.length === 0) return null;
  const estimatedTotal = estimatedProperties.reduce((total, property) => total + (property.estimatedImu ?? 0), 0);
  return deviationPercent(currentTotal, estimatedTotal);
}

function googleMapsUrl(property: PropertyItem) {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", propertyLocation(property));
  return url.toString();
}

function googleEarthUrl(property: PropertyItem) {
  return `https://earth.google.com/web/search/${encodeURIComponent(propertyLocation(property))}`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getCounts(study: FeasibilityStudy) {
  return study.properties.reduce(
    (acc, property) => {
      acc.total += 1;
      if (property.hasStudy) acc.performed += 1;
      if (property.outcome === "Positivo") acc.positive += 1;
      if (property.outcome === "Negativo") acc.negative += 1;
      if (property.outcome === "Neutro") acc.pending += 1;
      if (property.categoria.startsWith("D/")) acc.catD += 1;
      return acc;
    },
    { total: 0, performed: 0, positive: 0, negative: 0, pending: 0, catD: 0 },
  );
}

function normalizePropertyOutcome(value: string): PropertyOutcome {
  const normalized = value.toLowerCase();
  if (normalized === "positivo") return "Positivo";
  if (normalized === "negativo") return "Negativo";
  return "Neutro";
}

function propertyWithEstimatedValue(
  property: PropertyItem,
  estimatedRendita: number,
  estimatedImu?: number | null,
  imuCalculation?: PropertyImuCalculation | null,
): PropertyItem {
  const diffPercent =
    property.currentRendita === 0
      ? 0
      : ((estimatedRendita - property.currentRendita) / property.currentRendita) * 100;
  return {
    ...property,
    estimatedRendita,
    ...(estimatedImu === undefined
      ? {}
      : {
          estimatedImu,
          estimatedImuSource: imuCalculation?.status === "calculated" ? "calculated" as const : property.estimatedImuSource,
          imuDiff: estimatedImu === null || property.currentImu === null || property.currentImu === undefined
            ? 0
            : estimatedImu - property.currentImu,
        }),
    ...(imuCalculation ? { imuCalculation } : {}),
    diffPercent,
    hasStudy: true,
  };
}

function recalculateStudyRenditaTotals(study: FeasibilityStudy): FeasibilityStudy {
  const originalRendita = study.properties.reduce((sum, property) => sum + property.currentRendita, 0);
  const totalRendita = study.properties.reduce((sum, property) => sum + property.estimatedRendita, 0);
  const currentImu = study.properties.reduce((sum, property) => sum + (property.currentImu ?? 0), 0);
  const estimatedImu = study.properties.reduce((sum, property) => sum + (property.estimatedImu ?? 0), 0);
  return {
    ...study,
    originalRendita,
    totalRendita,
    diffRendita: totalRendita - originalRendita,
    diffImu: estimatedImu - currentImu,
  };
}

function getSortValue(study: FeasibilityStudy, sortKey: SortKey) {
  switch (sortKey) {
    case "id":
      return study.id;
    case "createdAt":
      return new Date(study.createdAt).getTime();
    case "importedAt":
      return new Date(study.importedAt).getTime();
    case "concludedAt":
      return study.concludedAt ? new Date(study.concludedAt).getTime() : 0;
    case "deadline":
      return new Date(study.deadline).getTime();
    case "nextAppointment":
      return study.nextAppointment ? new Date(study.nextAppointment).getTime() : 0;
    case "diffRendita":
      return study.diffRendita;
    case "diffImu":
      return study.diffImu;
    case "appointment":
      return study.nextAppointment ? 1 : 0;
    case "originalRendita":
      return study.originalRendita;
    case "totalRendita":
      return study.totalRendita;
    case "propertiesCount":
      return study.properties.length;
    case "commercialOwner":
      return study.commercialOwner;
    case "technicalOwner":
      return study.technicalOwner;
  }
}

function App() {
  const [studies, setStudies] = useState<FeasibilityStudy[]>(demoStudies);
  const [route, setRoute] = useState<AppRoute>(routeFromLocation);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("importedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<StudyStatus | "Tutti">("Tutti");
  const [regionFilter, setRegionFilter] = useState("Tutte");
  const [appointmentOnly, setAppointmentOnly] = useState(false);
  const [expandedStudy, setExpandedStudy] = useState("");
  const [propertyDetailsStudy, setPropertyDetailsStudy] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [selectedStudyIds, setSelectedStudyIds] = useState<string[]>([]);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(() => {
    return window.localStorage.getItem("soul-summary-panel-collapsed") === "true";
  });
  const [editorDirty, setEditorDirty] = useState(false);
  const [newStudyModalOpen, setNewStudyModalOpen] = useState(false);
  const [newStudyBusy, setNewStudyBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const abortController = new AbortController();

    async function loadStudies() {
      try {
        const response = await fetch(`${API_BASE_URL}/studies`, {
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const importedStudies = (await response.json()) as FeasibilityStudy[];
        if (!Array.isArray(importedStudies)) throw new Error("Risposta studi non valida");
        setStudies(importedStudies);
        setExpandedStudy((current) =>
          current && importedStudies.some((study) => study.id === current) ? current : "",
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStudies(demoStudies);
      }
    }

    void loadStudies();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    window.localStorage.setItem("soul-summary-panel-collapsed", String(sidePanelCollapsed));
  }, [sidePanelCollapsed]);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    }

    window.addEventListener("keydown", handleSearchShortcut);
    return () => {
      window.removeEventListener("keydown", handleSearchShortcut);
    };
  }, []);

  useEffect(() => {
    function handlePopState() {
      const nextRoute = routeFromLocation();
      if (
        route.view === "editor" &&
        editorDirty &&
        !window.confirm("Sono presenti modifiche alla planimetria non salvate. Uscire comunque?")
      ) {
        window.history.pushState({}, "", pathForRoute(route));
        return;
      }
      setEditorDirty(false);
      setRoute(nextRoute);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [editorDirty, route]);

  function navigate(nextRoute: AppRoute) {
    if (
      route.view === "editor" &&
      editorDirty &&
      !window.confirm("Sono presenti modifiche alla planimetria non salvate. Uscire comunque?")
    ) {
      return false;
    }
    window.history.pushState({}, "", pathForRoute(nextRoute));
    setEditorDirty(false);
    setRoute(nextRoute);
    return true;
  }

  function handleGlobalQuery(nextQuery: string) {
    if (route.view !== "dashboard" && route.view !== "studies") {
      if (!navigate({ view: "studies" })) return;
    }
    setQuery(nextQuery);
  }

  const filteredStudies = useMemo(() => {
    return studies
      .filter((study) => {
        const searchable = `${study.company} ${study.vat} ${study.id} ${study.comune} ${study.commercialOwner} ${study.technicalOwner}`.toLowerCase();
        const matchesText = searchable.includes(query.trim().toLowerCase());
        const matchesStatus = statusFilter === "Tutti" || study.status === statusFilter;
        const matchesRegion = regionFilter === "Tutte" || study.region === regionFilter;
        const matchesAppointment = !appointmentOnly || Boolean(study.nextAppointment);
        return matchesText && matchesStatus && matchesRegion && matchesAppointment;
      })
      .sort((a, b) => {
        const first = getSortValue(a, sortKey);
        const second = getSortValue(b, sortKey);
        let comparison = 0;

        if (typeof first === "string" && typeof second === "string") {
          comparison = first.localeCompare(second, "it");
        } else {
          comparison = Number(first) - Number(second);
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [appointmentOnly, query, regionFilter, sortDirection, sortKey, statusFilter, studies]);

  const regions = useMemo(
    () => ["Tutte", ...Array.from(new Set(studies.map((study) => study.region)))],
    [studies],
  );

  const activeStudy = route.view === "study"
    ? studies.find((study) => study.id === route.studyId)
    : undefined;
  const editorStudy = route.view === "editor"
    ? studies.find((study) => study.id === route.studyId)
    : undefined;
  const editorProperty = editorStudy?.properties.find(
    (property) => property.id === (route.view === "editor" ? route.propertyId : ""),
  );

  const totals = useMemo(() => {
    const visible = filteredStudies;
    const inProgress = visible.filter(
      (study) => study.status === "In lavorazione" || study.status === "In revisione",
    ).length;
    const concluded = visible.filter((study) => study.status === "Concluso").length;
    const potentialRendita = visible.reduce((sum, study) => sum + study.totalRendita, 0);
    const averageDiff =
      visible.reduce((sum, study) => sum + study.diffRendita, 0) / Math.max(visible.length, 1);
    return {
      inProgress,
      concluded,
      potentialRendita,
      averageDiff,
    };
  }, [filteredStudies]);

  const activeFilterCount = [
    query.trim(),
    statusFilter !== "Tutti",
    regionFilter !== "Tutte",
    appointmentOnly,
  ].filter(Boolean).length;

  const selectedStudies = studies.filter((study) => selectedStudyIds.includes(study.id));
  const allVisibleSelected =
    filteredStudies.length > 0 &&
    filteredStudies.every((study) => selectedStudyIds.includes(study.id));

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function updateStudy(studyId: string, input: StudyUpdate) {
    try {
      const response = await fetch(`${API_BASE_URL}/studies/${encodeURIComponent(studyId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updatedStudy = (await response.json()) as FeasibilityStudy;
      setStudies((current) =>
        current.map((study) => (study.id === updatedStudy.id ? updatedStudy : study)),
      );
      flash(input.notes !== undefined ? "Note salvate." : "Stato aggiornato.");
      return true;
    } catch {
      flash("Impossibile salvare le modifiche dello studio.");
      return false;
    }
  }

  function updatePropertyInStudies(
    propertyId: string,
    updater: (property: PropertyItem) => PropertyItem,
    recalculateRenditaTotals = false,
  ) {
    setStudies((current) =>
      current.map((study) => {
        let changed = false;
        const properties = study.properties.map((property) => {
          if (property.id !== propertyId) return property;
          changed = true;
          return updater(property);
        });
        if (!changed) return study;
        const updatedStudy = { ...study, properties };
        return recalculateRenditaTotals ? recalculateStudyRenditaTotals(updatedStudy) : updatedStudy;
      }),
    );
  }

  function updatePropertyEstimatedValue(
    propertyId: string,
    estimatedRendita: number,
    estimatedImu?: number | null,
    imuCalculation?: PropertyImuCalculation | null,
  ) {
    updatePropertyInStudies(
      propertyId,
      (property) => propertyWithEstimatedValue(property, estimatedRendita, estimatedImu, imuCalculation),
      true,
    );
  }

  async function savePropertyImuOverrides(
    propertyId: string,
    patch: { imuRateOverride?: number | null; imuMultiplierOverride?: number | null },
  ): Promise<PropertyImuOverrideUpdate> {
    const response = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(propertyId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(payload?.message ?? `HTTP ${response.status}`);
    }
    const update = (await response.json()) as PropertyImuOverrideUpdate;
    updatePropertyInStudies(propertyId, (property) => ({ ...property, ...update }), true);
    if (Object.prototype.hasOwnProperty.call(patch, "imuMultiplierOverride")) {
      flash(update.imuMultiplierOverride === null
        ? "Ripristinato il moltiplicatore catastale di sistema."
        : "Moltiplicatore catastale manuale salvato e applicato ai calcoli.");
    } else {
      flash(update.imuRateOverride === null
        ? "Ripristinata l’aliquota IMU predefinita dal sistema."
        : "Aliquota IMU manuale salvata e applicata ai calcoli.");
    }
    return update;
  }

  async function createStudyFromPq(form: NewStudyFormState) {
    setNewStudyBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/studies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: form.company,
          vat: form.vat,
          comune: form.comune,
          provincia: form.provincia,
          region: form.region,
          deadline: form.deadline,
          commercialOwner: "Default User",
          technicalOwner: "Default User",
          notes: form.notes,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const createdStudy = (await response.json()) as FeasibilityStudy | null;
      if (!createdStudy?.id) throw new Error("Risposta creazione studio non valida");
      setStudies((current) => [createdStudy, ...current.filter((study) => study.id !== createdStudy.id)]);
      setNewStudyModalOpen(false);
      flash("Studio creato in PQ.");
      navigate({ view: "study", studyId: createdStudy.id });
      return true;
    } catch (error) {
      console.error(error);
      flash("Impossibile creare lo studio.");
      return false;
    } finally {
      setNewStudyBusy(false);
    }
  }

  async function createPropertyForStudy(studyId: string, form: NewPropertyFormState) {
    if ([form.currentRendita, form.estimatedRendita, form.currentImu, form.estimatedImu].some(hasInvalidDecimalInput)) {
      flash("Inserisci valori economici validi.");
      return false;
    }
    const currentRendita = parseOptionalDecimalInput(form.currentRendita);
    const estimatedRendita = parseOptionalDecimalInput(form.estimatedRendita);
    const currentImu = parseOptionalDecimalInput(form.currentImu);
    const estimatedImu = parseOptionalDecimalInput(form.estimatedImu);

    try {
      const response = await fetch(`${API_BASE_URL}/studies/${encodeURIComponent(studyId)}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.address,
          ubicazione: form.address,
          comune: form.comune,
          provincia: form.provincia,
          foglio: form.foglio,
          particella: form.particella,
          subalterno: form.subalterno,
          categoria: form.categoria,
          titolarita: form.titolarita,
          currentRendita: currentRendita ?? 0,
          estimatedRendita: estimatedRendita ?? 0,
          currentImu,
          estimatedImu,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updatedStudy = (await response.json()) as FeasibilityStudy;
      setStudies((current) => current.map((study) => (study.id === updatedStudy.id ? updatedStudy : study)));
      flash("Immobile aggiunto allo studio.");
      return true;
    } catch (error) {
      console.error(error);
      flash("Impossibile aggiungere l'immobile.");
      return false;
    }
  }

  async function deletePropertiesFromStudy(studyId: string, propertyIds: string[]) {
    try {
      const response = await fetch(`${API_BASE_URL}/studies/${encodeURIComponent(studyId)}/properties`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyIds }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updatedStudy = (await response.json()) as FeasibilityStudy;
      setStudies((current) => current.map((study) => (study.id === updatedStudy.id ? updatedStudy : study)));
      flash(propertyIds.length === 1 ? "Immobile eliminato." : "Immobili eliminati.");
      return true;
    } catch (error) {
      console.error(error);
      flash("Impossibile eliminare gli immobili selezionati.");
      return false;
    }
  }

  function updatePropertyDocument(
    propertyId: string,
    type: "planimetria" | "elenco_subalterni",
    fileName: string,
    downloadUrl: string,
  ) {
    const field = propertyDocumentField(type);
    updatePropertyInStudies(propertyId, (property) => ({
      ...property,
      documents: {
        ...property.documents,
        [field]: fileName,
      },
      documentUrls: {
        ...property.documentUrls,
        [field]: downloadUrl,
      },
    }));
    flash(type === "planimetria"
      ? "Planimetria salvata nei documenti dell'immobile."
      : "Elenco subalterni salvato nei documenti dell'immobile.");
  }

  async function updatePropertyOutcome(propertyId: string, outcome: PropertyOutcome) {
    try {
      const response = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(propertyId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updated = (await response.json()) as { id: string; outcome: string };
      updatePropertyInStudies(updated.id, (property) => ({
        ...property,
        outcome: normalizePropertyOutcome(updated.outcome),
      }));
      flash("Esito immobile aggiornato.");
      return true;
    } catch {
      flash("Impossibile aggiornare l'esito immobile.");
      return false;
    }
  }

  async function reorderStudyProperties(studyId: string, propertyIds: string[]) {
    try {
      const response = await fetch(`${API_BASE_URL}/studies/${encodeURIComponent(studyId)}/properties/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyIds }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const updatedStudy = (await response.json()) as FeasibilityStudy;
      setStudies((current) =>
        current.map((study) => (study.id === updatedStudy.id ? updatedStudy : study)),
      );
      flash("Ordine immobili salvato.");
      return true;
    } catch {
      flash("Impossibile salvare l'ordine degli immobili.");
      return false;
    }
  }

  function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(";"),
      )
      .join("\n");

    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadSelectedCsv() {
    const headers = [
      "ID studio",
      "Azienda",
      "P. IVA",
      "Comune",
      "Stato",
      "Data importazione ERP",
      "Data creazione",
      "Data esito",
      "Scadenza",
      "Prossimo appuntamento",
      "Differenza rendita",
      "Differenza IMU",
      "Rendita originale",
      "Rendita totale",
      "Numero immobili",
      "Commerciale",
      "Responsabile tecnico",
    ];

    const rows = selectedStudies.map((study) => [
      study.id,
      study.company,
      study.vat,
      `${study.comune} (${study.provincia})`,
      study.status,
      study.importedAt,
      study.createdAt,
      study.concludedAt ?? "",
      study.deadline,
      study.nextAppointment ?? "",
      study.diffRendita,
      study.diffImu,
      study.originalRendita,
      study.totalRendita,
      study.properties.length,
      study.commercialOwner,
      study.technicalOwner,
    ]);

    downloadCsv("studi-fattibilita-selezionati.csv", headers, rows);
    flash(`${selectedStudies.length} studi esportati in CSV.`);
  }

  function downloadStudyPropertiesCsv(study: FeasibilityStudy) {
    const headers = [
      "ID immobile",
      "Ubicazione",
      "Foglio",
      "Particella",
      "Subalterno",
      "Categoria",
      "Titolarità",
      "Rendita attuale",
      "Rendita proposta",
      "Differenza rendita percentuale",
      "IMU attuale",
      "IMU prevista",
      "Differenza IMU percentuale",
      "Esito",
    ];
    const rows = study.properties.map((property) => [
      property.id,
      propertyLocation(property),
      property.foglio ?? "",
      property.particella ?? "",
      property.subalterno ?? "",
      property.categoria,
      formatTitolarita(property.titolarita, ""),
      property.currentRendita,
      property.estimatedRendita,
      property.diffPercent,
      property.currentImu ?? "",
      property.estimatedImu ?? "",
      deviationPercent(property.currentImu, property.estimatedImu) ?? "",
      property.outcome,
    ]);
    downloadCsv(`${study.id.toLowerCase()}-immobili.csv`, headers, rows);
    flash("Immobili dello studio esportati in CSV.");
  }

  function resetFilters() {
    setQuery("");
    setStatusFilter("Tutti");
    setRegionFilter("Tutte");
    setAppointmentOnly(false);
  }

  function handleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection("desc");
  }

  function toggleStudySelection(studyId: string) {
    setSelectedStudyIds((current) =>
      current.includes(studyId)
        ? current.filter((selectedId) => selectedId !== studyId)
        : [...current, studyId],
    );
  }

  function toggleVisibleSelection() {
    setSelectedStudyIds((current) => {
      if (allVisibleSelected) {
        return current.filter((selectedId) => !filteredStudies.some((study) => study.id === selectedId));
      }
      return Array.from(new Set([...current, ...filteredStudies.map((study) => study.id)]));
    });
  }

  if (route.view === "editor" && editorStudy && editorProperty) {
    return (
      <Shell
        query={query}
        setQuery={handleGlobalQuery}
        toast={toast}
        activeSection={navSectionForRoute(route)}
        onNavigate={navigate}
        editorMode
      >
        <Suspense fallback={<div className="editor-loading">Caricamento editor planimetrie...</div>}>
          <PlanimetriaEditor
            study={editorStudy}
            property={editorProperty}
            onBack={() => navigate({ view: "study", studyId: editorStudy.id })}
            onDirtyChange={setEditorDirty}
            onDraftSaved={updatePropertyEstimatedValue}
            onImuOverridesSave={savePropertyImuOverrides}
            onDocumentSaved={updatePropertyDocument}
          />
        </Suspense>
      </Shell>
    );
  }

  if (route.view === "study" && activeStudy) {
    return (
      <Shell
        query={query}
        setQuery={handleGlobalQuery}
        toast={toast}
        activeSection={navSectionForRoute(route)}
        onNavigate={navigate}
      >
        <StudyDetail
          study={activeStudy}
          onBack={() => navigate({ view: "studies" })}
          onExport={() => downloadStudyPropertiesCsv(activeStudy)}
          onNotice={flash}
          onUpdate={(input) => updateStudy(activeStudy.id, input)}
          onReorder={(propertyIds) => reorderStudyProperties(activeStudy.id, propertyIds)}
          onCreateProperty={(form) => createPropertyForStudy(activeStudy.id, form)}
          onDeleteProperties={(propertyIds) => deletePropertiesFromStudy(activeStudy.id, propertyIds)}
          onPropertyEstimateChange={updatePropertyEstimatedValue}
          onImuOverridesSave={savePropertyImuOverrides}
          onOutcomeChange={updatePropertyOutcome}
          onOpenEditor={(property) =>
            navigate({ view: "editor", studyId: activeStudy.id, propertyId: property.id })
          }
        />
      </Shell>
    );
  }

  if (route.view === "properties") {
    return (
      <Shell
        query={query}
        setQuery={handleGlobalQuery}
        toast={toast}
        activeSection={navSectionForRoute(route)}
        onNavigate={navigate}
      >
        <PropertiesPage
          studies={studies}
          onOpenStudy={(study) => navigate({ view: "study", studyId: study.id })}
          onOpenEditor={(study, property) =>
            navigate({ view: "editor", studyId: study.id, propertyId: property.id })
          }
          onOutcomeChange={updatePropertyOutcome}
        />
      </Shell>
    );
  }

  if (route.view === "settings") {
    return (
      <Shell
        query={query}
        setQuery={handleGlobalQuery}
        toast={toast}
        activeSection={navSectionForRoute(route)}
        onNavigate={navigate}
      >
        <SettingsPage appVersion={APP_DEPLOY_VERSION} onNotice={flash} />
      </Shell>
    );
  }

  if (route.view === "analysis" || route.view === "report" || route.view === "activity") {
    const sections = {
      analysis: {
        title: "Analisi",
        description: "I pannelli analitici saranno collegati ai dati consolidati degli studi.",
      },
      report: {
        title: "Report",
        description: "La generazione di report e presentazioni richiede il servizio documentale.",
      },
      activity: {
        title: "Registro attività",
        description: "Gli eventi operativi saranno popolati dall'integrazione ERP e dalle versioni salvate.",
      },
    } as const;
    return (
      <Shell
        query={query}
        setQuery={handleGlobalQuery}
        toast={toast}
        activeSection={navSectionForRoute(route)}
        onNavigate={navigate}
      >
        <PendingPage {...sections[route.view]} onOpenStudies={() => navigate({ view: "studies" })} />
      </Shell>
    );
  }

  if ((route.view === "study" && !activeStudy) || (route.view === "editor" && (!editorStudy || !editorProperty))) {
    return (
      <Shell
        query={query}
        setQuery={handleGlobalQuery}
        toast={toast}
        activeSection="Studi di fattibilità"
        onNavigate={navigate}
      >
        <PendingPage
          title="Elemento non trovato"
          description="Lo studio o l'immobile richiesto non è disponibile nella vista corrente."
          onOpenStudies={() => navigate({ view: "studies" })}
        />
      </Shell>
    );
  }

  return (
    <Shell
      query={query}
      setQuery={handleGlobalQuery}
      toast={toast}
      activeSection={navSectionForRoute(route)}
      onNavigate={navigate}
    >
      <main className={`dashboard-grid ${sidePanelCollapsed ? "summary-collapsed" : ""}`}>
        <section className="workspace">
          <div className="page-heading">
            <div>
              <h1>{route.view === "studies" ? "Studi di fattibilità" : "Dashboard studi di fattibilità"}</h1>
              <p>
                Monitora gli studi importati dall'ERP, le priorità commerciali e le differenze
                di rendita catastale.
              </p>
            </div>
            <button className="button primary" type="button" onClick={() => setNewStudyModalOpen(true)}>
              <Plus size={17} />
              Nuovo studio
            </button>
          </div>

          <section className="table-card">
            <div className="table-card-header">
              <div>
                <h2>Ultimi studi importati</h2>
                <p>{filteredStudies.length} risultati nella vista corrente</p>
              </div>
              <div className="legend-inline" aria-label="Legenda immobili">
                <span>
                  <i className="dot positive" /> Positivo
                </span>
                <span>
                  <i className="dot negative" /> Negativo
                </span>
                <span>
                  <i className="dot pending" /> Neutro
                </span>
              </div>
            </div>

            <div className="table-tools">
              <button
                className="filters-toggle"
                aria-expanded={filtersExpanded}
                onClick={() => setFiltersExpanded((expanded) => !expanded)}
              >
                <SlidersHorizontal size={18} />
                <span>Filtri attivi ({activeFilterCount})</span>
                {filtersExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </button>

              {filtersExpanded && (
                <section className="filters-panel in-table" aria-label="Filtri studi di fattibilità">
                  <div className="filters-summary">
                    <div className="filter-chips">
                      {statusFilter !== "Tutti" && (
                        <button className="chip" onClick={() => setStatusFilter("Tutti")}>
                          Stato: {statusFilter}
                          <X size={14} />
                        </button>
                      )}
                      {regionFilter !== "Tutte" && (
                        <button className="chip" onClick={() => setRegionFilter("Tutte")}>
                          Regione: {regionFilter}
                          <X size={14} />
                        </button>
                      )}
                      {appointmentOnly && (
                        <button className="chip urgent" onClick={() => setAppointmentOnly(false)}>
                          Appuntamento presente
                          <X size={14} />
                        </button>
                      )}
                      {query.trim() && (
                        <button className="chip" onClick={() => setQuery("")}>
                          Ricerca: {query}
                          <X size={14} />
                        </button>
                      )}
                      {activeFilterCount === 0 && (
                        <span className="muted-chip">Nessun filtro applicato</span>
                      )}
                    </div>
                    <button className="icon-button" title="Reimposta filtri" aria-label="Reimposta filtri" onClick={resetFilters}>
                      <RefreshCw size={17} />
                    </button>
                  </div>

                  <div className="filter-controls">
                    <label className="search-field table-search">
                      <Search size={17} />
                      <input
                        aria-label="Cerca studi per azienda, partita IVA o comune"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Cerca per azienda, P. IVA, comune..."
                      />
                    </label>

                    <label className="select-field">
                      <span>Ordina per</span>
                      <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                        {sortOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      className="button ghost sort-toggle"
                      onClick={() => setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
                    >
                      <ArrowDownUp size={16} />
                      {sortDirection === "asc" ? "Crescente" : "Decrescente"}
                    </button>

                    <label className="select-field">
                      <span>Stato</span>
                      <select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value as StudyStatus | "Tutti")}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="select-field">
                      <span>Regione</span>
                      <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
                        {regions.map((region) => (
                          <option key={region} value={region}>
                            {region}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="toggle-field">
                      <input
                        type="checkbox"
                        checked={appointmentOnly}
                        onChange={(event) => setAppointmentOnly(event.target.checked)}
                      />
                      <span>Appuntamento presente</span>
                    </label>
                  </div>
                </section>
              )}

              <div className="selection-toolbar" aria-label="Azioni studi selezionati">
                <span className="selection-count">
                  {selectedStudies.length > 0
                    ? `${selectedStudies.length} studi selezionati`
                    : "Seleziona gli studi da elaborare"}
                </span>
                <button
                  className="button primary"
                  disabled
                  title={selectedStudies.length > 0 ? "Disponibile dopo integrazione ERP" : "Seleziona almeno uno studio"}
                >
                  <Send size={17} />
                  Invia a ERP
                </button>
                <button className="button secondary" disabled={selectedStudies.length === 0} onClick={downloadSelectedCsv}>
                  <FileSpreadsheet size={17} />
                  Esporta selezione CSV
                </button>
              </div>
            </div>

            <div className="studies-table-wrap">
              <table className="studies-table">
                <thead>
                  <tr>
                    <th className="selection-cell">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisibleSelection}
                        aria-label="Seleziona tutti gli studi visibili"
                      />
                    </th>
                    <SortableHeader
                      label="ID studio"
                      sortKey="id"
                      activeSort={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <th>Azienda</th>
                    <SortableHeader
                      label="N. immobili"
                      sortKey="propertiesCount"
                      activeSort={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <th>Stato</th>
                    <SortableHeader
                      label="Importato ERP"
                      sortKey="importedAt"
                      activeSort={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Scadenza"
                      sortKey="deadline"
                      activeSort={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Diff. rendita"
                      sortKey="diffRendita"
                      activeSort={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Diff. IMU"
                      sortKey="diffImu"
                      activeSort={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Rendita totale"
                      sortKey="totalRendita"
                      activeSort={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Commerciale"
                      sortKey="commercialOwner"
                      activeSort={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <th aria-label="Apri studio di fattibilità" />
                  </tr>
                </thead>
                <tbody>
                  {filteredStudies.map((study) => (
                    <StudyRows
                      key={study.id}
                      study={study}
                      expanded={expandedStudy === study.id}
                      selected={selectedStudyIds.includes(study.id)}
                      propertyDetailsOpen={propertyDetailsStudy === study.id}
                      onSelect={() => toggleStudySelection(study.id)}
                      onToggle={() => {
                        setExpandedStudy((current) => (current === study.id ? "" : study.id));
                        setPropertyDetailsStudy("");
                      }}
                      onTogglePropertyDetails={() =>
                        setPropertyDetailsStudy((current) => (current === study.id ? "" : study.id))
                      }
                      onOpenDetail={() => navigate({ view: "study", studyId: study.id })}
                      onOpenEditor={(property) =>
                        navigate({ view: "editor", studyId: study.id, propertyId: property.id })
                      }
                      onUpdate={(input) => updateStudy(study.id, input)}
                      onOutcomeChange={updatePropertyOutcome}
                      onNotice={flash}
                    />
                  ))}
                </tbody>
              </table>
              {filteredStudies.length === 0 && (
                <div className="empty-state">
                  <Search size={22} />
                  <strong>Nessuno studio trovato</strong>
                  <span>Modifica ricerca o filtri per ampliare i risultati.</span>
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className={`side-panel ${sidePanelCollapsed ? "collapsed" : ""}`}>
          <div className="side-panel-controls">
            {!sidePanelCollapsed && <strong>Vista sintetica</strong>}
            <button
              className="side-panel-toggle"
              type="button"
              onClick={() => setSidePanelCollapsed((collapsed) => !collapsed)}
              title={sidePanelCollapsed ? "Mostra riepilogo e attività" : "Nascondi riepilogo e attività"}
              aria-label={sidePanelCollapsed ? "Mostra riepilogo e attività" : "Nascondi riepilogo e attività"}
            >
              {sidePanelCollapsed ? <PanelRightOpen size={19} /> : <PanelRightClose size={19} />}
              {!sidePanelCollapsed && <span>Nascondi</span>}
            </button>
          </div>
          {!sidePanelCollapsed && (
            <>
          <section className="summary-card">
            <h2>Riepilogo</h2>
            <MetricCard
              icon={<Clock3 size={24} />}
              label="Studi in corso"
              value={numberFormatter.format(totals.inProgress)}
              tone="blue"
              delta="Nella vista corrente"
            />
            <MetricCard
              icon={<CheckCircle2 size={24} />}
              label="Studi conclusi"
              value={numberFormatter.format(totals.concluded)}
              tone="green"
              delta="Nella vista corrente"
            />
            <MetricCard
              icon={<BarChart3 size={24} />}
              label="Diff. rendita media"
              value={formatPercent(totals.averageDiff)}
              tone="purple"
              delta="Nella vista corrente"
            />
            <MetricCard
              icon={<Euro size={24} />}
              label="Rendita potenziale totale"
              value={formatEuro(totals.potentialRendita)}
              tone="orange"
              delta="Nella vista corrente"
            />
          </section>

          <section className="activity-card">
            <div className="activity-header">
              <h2>Attività recenti</h2>
              <button onClick={() => navigate({ view: "activity" })}>Vedi tutto</button>
            </div>
            <ActivityItem
              tone="green"
              title="Studio S-2026-0187 completato"
              subtitle="Immobiliare Aurora Srl"
              time="10:24"
            />
            <ActivityItem
              tone="blue"
              title="Importazione ERP completata"
              subtitle="32 nuovi studi importati"
              time="09:15"
            />
            <ActivityItem
              tone="purple"
              title="Nuovo studio creato"
              subtitle="Green Stone Srl"
              time="Ieri 16:48"
            />
            <ActivityItem
              tone="orange"
              title="Documenti caricati"
              subtitle="Via Manzoni 12, Milano"
              time="Ieri 14:02"
            />
            <button className="button soft full-width" onClick={() => navigate({ view: "activity" })}>
              Vai al registro attività
              <ChevronRight size={16} />
            </button>
          </section>
            </>
          )}
        </aside>
      </main>
      {newStudyModalOpen && (
        <NewStudyModal
          busy={newStudyBusy}
          onClose={() => setNewStudyModalOpen(false)}
          onCreate={createStudyFromPq}
        />
      )}
    </Shell>
  );
}

function ComuneAutocomplete({
  id,
  value,
  province,
  region,
  onChange,
  required = false,
  autoFocus = false,
}: {
  id: string;
  value: string;
  province: string;
  region: string;
  onChange: (selection: { comune: string; provincia: string; region: string }) => void;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const [options, setOptions] = useState<ComuneOption[]>([]);
  const [loading, setLoading] = useState(false);
  const listId = `${id}-options`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadComuneOptions()
      .then((loadedOptions) => {
        if (!cancelled) setOptions(loadedOptions);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const match = findComuneOption(options, value);
    if (match && (province !== match.province || region !== match.region || value !== match.name)) {
      onChange({ comune: match.name, provincia: match.province, region: match.region });
    }
  }, [onChange, options, province, region, value]);

  const suggestions = useMemo(() => {
    const query = normalizeComuneSearch(value);
    if (!query) return options.slice(0, 20);
    return options
      .filter((option) => option.search.includes(query) || normalizeComuneSearch(option.name).startsWith(query))
      .slice(0, 24);
  }, [options, value]);

  function handleInput(nextValue: string) {
    const match = findComuneOption(options, nextValue);
    onChange({
      comune: match?.name ?? nextValue,
      provincia: match?.province ?? "",
      region: match?.region ?? "",
    });
  }

  return (
    <label>
      <span>Comune *</span>
      <input
        id={id}
        autoFocus={autoFocus}
        required={required}
        list={listId}
        value={value}
        onChange={(event) => handleInput(event.target.value)}
        placeholder={loading ? "Caricamento comuni..." : "Inizia a digitare il comune"}
      />
      <datalist id={listId}>
        {suggestions.map((option) => (
          <option key={`${option.name}-${option.province}`} value={option.name}>
            {option.label}
          </option>
        ))}
      </datalist>
    </label>
  );
}

function NewStudyModal({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (form: NewStudyFormState) => Promise<boolean>;
}) {
  const [form, setForm] = useState<NewStudyFormState>(() => initialNewStudyForm());

  function updateField<K extends keyof NewStudyFormState>(field: K, value: NewStudyFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateComune(selection: { comune: string; provincia: string; region: string }) {
    setForm((current) => ({
      ...current,
      comune: selection.comune,
      provincia: selection.provincia,
      region: selection.region,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success = await onCreate({
      company: form.company.trim(),
      vat: form.vat.trim(),
      comune: form.comune.trim(),
      provincia: form.provincia.trim().toUpperCase(),
      region: form.region.trim(),
      deadline: form.deadline,
      notes: form.notes.trim(),
    });
    if (success) setForm(initialNewStudyForm());
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="editor-modal new-study-modal"
        aria-labelledby="new-study-title"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="new-study-title">Nuovo studio</h2>
            <p>Creazione manuale da PQ, senza immobili iniziali.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Chiudi nuovo studio">
            <X size={16} />
          </button>
        </div>

        <p className="modal-note">
          Lo studio viene creato in PQ; il mapping verso ERP andrà completato con la prossima estensione del sync.
        </p>

        <div className="new-study-form-grid">
          <label>
            <span>Azienda *</span>
            <input
              autoFocus
              required
              value={form.company}
              onChange={(event) => updateField("company", event.target.value)}
              placeholder="ACME srl"
            />
          </label>
          <label>
            <span>Partita IVA</span>
            <input value={form.vat} onChange={(event) => updateField("vat", event.target.value)} placeholder="00000000000" />
          </label>
          <ComuneAutocomplete
            id="new-study-comune"
            value={form.comune}
            province={form.provincia}
            region={form.region}
            onChange={updateComune}
            required
          />
          <label>
            <span>Provincia</span>
            <input required readOnly value={form.provincia} placeholder="Deducibile dal comune" />
          </label>
          <label>
            <span>Regione</span>
            <input required readOnly value={form.region} placeholder="Deducibile dal comune" />
          </label>
          <label>
            <span>Scadenza</span>
            <input type="date" value={form.deadline} onChange={(event) => updateField("deadline", event.target.value)} />
          </label>
          <label className="wide">
            <span>Note</span>
            <textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
          </label>
        </div>

        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            <Plus size={15} />
            {busy ? "Creazione..." : "Crea studio"}
          </button>
        </div>
      </form>
    </div>
  );
}

function NewPropertyModal({
  study,
  busy,
  onClose,
  onCreate,
}: {
  study: FeasibilityStudy;
  busy: boolean;
  onClose: () => void;
  onCreate: (form: NewPropertyFormState) => Promise<boolean>;
}) {
  const [form, setForm] = useState<NewPropertyFormState>(() => initialNewPropertyForm(study));

  useEffect(() => {
    setForm(initialNewPropertyForm(study));
  }, [study.id]);

  function updateField<K extends keyof NewPropertyFormState>(field: K, value: NewPropertyFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateComune(selection: { comune: string; provincia: string; region: string }) {
    setForm((current) => ({
      ...current,
      comune: selection.comune,
      provincia: selection.provincia,
      region: selection.region,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const success = await onCreate({
      address: form.address.trim(),
      comune: form.comune.trim(),
      provincia: form.provincia.trim().toUpperCase(),
      region: form.region.trim(),
      categoria: form.categoria.trim().toUpperCase() || "D/7",
      foglio: form.foglio.trim(),
      particella: form.particella.trim(),
      subalterno: form.subalterno.trim(),
      titolarita: formatTitolarita(form.titolarita, ""),
      currentRendita: form.currentRendita.trim(),
      estimatedRendita: form.estimatedRendita.trim(),
      currentImu: form.currentImu.trim(),
      estimatedImu: form.estimatedImu.trim(),
    });
    if (success) setForm(initialNewPropertyForm(study));
  }

  const selectedTitolaritaPreset = getPresetTitolarita(form.titolarita);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="editor-modal new-study-modal"
        aria-labelledby="new-property-title"
        onSubmit={handleSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="new-property-title">Nuovo immobile</h2>
            <p>{study.company}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Chiudi nuovo immobile">
            <X size={16} />
          </button>
        </div>

        <div className="new-study-form-grid">
          <label className="wide">
            <span>Ubicazione *</span>
            <input
              autoFocus
              required
              value={form.address}
              onChange={(event) => updateField("address", event.target.value)}
              placeholder="Via Roma 1"
            />
          </label>
          <ComuneAutocomplete
            id="new-property-comune"
            value={form.comune}
            province={form.provincia}
            region={form.region}
            onChange={updateComune}
            required
          />
          <label>
            <span>Provincia</span>
            <input required readOnly value={form.provincia} placeholder="Deducibile dal comune" />
          </label>
          <label>
            <span>Regione</span>
            <input required readOnly value={form.region} placeholder="Deducibile dal comune" />
          </label>
          <label>
            <span>Categoria</span>
            <input value={form.categoria} onChange={(event) => updateField("categoria", event.target.value)} placeholder="D/7" />
          </label>
          <label>
            <span>Foglio</span>
            <input value={form.foglio} onChange={(event) => updateField("foglio", event.target.value)} />
          </label>
          <label>
            <span>Particella</span>
            <input value={form.particella} onChange={(event) => updateField("particella", event.target.value)} />
          </label>
          <label>
            <span>Sub</span>
            <input value={form.subalterno} onChange={(event) => updateField("subalterno", event.target.value)} />
          </label>
          <label>
            <span>Titolarità</span>
            <select
              value={selectedTitolaritaPreset ?? "Altro"}
              onChange={(event) => updateField("titolarita", event.target.value === "Altro" ? "" : event.target.value)}
            >
              {titolaritaOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {!selectedTitolaritaPreset && (
            <label>
              <span>Titolarità personalizzata</span>
              <input
                value={form.titolarita}
                onChange={(event) => updateField("titolarita", event.target.value)}
                placeholder="Descrivi la titolarità"
              />
            </label>
          )}
          <label>
            <span>Rendita attuale</span>
            <input inputMode="decimal" value={form.currentRendita} onChange={(event) => updateField("currentRendita", event.target.value)} />
          </label>
          <label>
            <span>Rendita proposta</span>
            <input inputMode="decimal" value={form.estimatedRendita} onChange={(event) => updateField("estimatedRendita", event.target.value)} />
          </label>
          <label>
            <span>IMU attuale</span>
            <input inputMode="decimal" value={form.currentImu} onChange={(event) => updateField("currentImu", event.target.value)} />
          </label>
          <label>
            <span>IMU prevista</span>
            <input inputMode="decimal" value={form.estimatedImu} onChange={(event) => updateField("estimatedImu", event.target.value)} />
          </label>
        </div>

        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            <Plus size={15} />
            {busy ? "Creazione..." : "Aggiungi immobile"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDeletePropertiesModal({
  busy,
  count,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="editor-modal confirm-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-properties-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="delete-properties-title">Elimina {count === 1 ? "immobile" : "immobili"}</h2>
            <p>Operazione permanente sullo studio corrente.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Chiudi conferma eliminazione">
            <X size={16} />
          </button>
        </div>
        <p className="modal-note">
          Verranno eliminati {count === 1 ? "l'immobile selezionato" : `${count} immobili selezionati`} con documenti,
          bozze aree e dati collegati. Vuoi continuare?
        </p>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button className="button danger-button" type="button" onClick={onConfirm} disabled={busy}>
            <Trash2 size={15} />
            {busy ? "Eliminazione..." : "Elimina"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Shell({
  children,
  query,
  setQuery,
  toast,
  activeSection,
  onNavigate,
  editorMode = false,
}: {
  children: React.ReactNode;
  query: string;
  setQuery: (query: string) => void;
  toast: string;
  activeSection: string;
  onNavigate: (route: AppRoute) => void;
  editorMode?: boolean;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return window.localStorage.getItem("soul-sidebar-collapsed") === "true";
  });

  useEffect(() => {
    window.localStorage.setItem("soul-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${editorMode ? "editor-shell" : ""}`}
    >
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand">
            <img src="/soul_logo_blu.png" alt="Soul Prospect Qualifier" />
            <span className="brand-product-name">Prospect Qualifier</span>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? "Espandi navigazione" : "Comprimi navigazione"}
            title={sidebarCollapsed ? "Espandi navigazione" : "Comprimi navigazione"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
        </div>
        <nav className="nav-menu" aria-label="Navigazione principale">
          <NavItem
            active={activeSection === "Studi di fattibilità"}
            icon={<ClipboardList size={21} />}
            label="Studi di fattibilità"
            onClick={() => onNavigate({ view: "studies" })}
          />
          <NavItem
            active={activeSection === "Immobili"}
            icon={<Building2 size={21} />}
            label="Immobili"
            onClick={() => onNavigate({ view: "properties" })}
          />
          <NavItem
            active={activeSection === "Analisi"}
            icon={<BarChart3 size={21} />}
            label="Analisi"
            disabled
            title="Analisi in preparazione"
            onClick={() => onNavigate({ view: "analysis" })}
          />
          <NavItem
            active={activeSection === "Report"}
            icon={<FileText size={21} />}
            label="Report"
            disabled
            title="Report in preparazione"
            onClick={() => onNavigate({ view: "report" })}
          />
          <NavItem
            active={activeSection === "Impostazioni"}
            icon={<Settings size={21} />}
            label="Impostazioni"
            onClick={() => onNavigate({ view: "settings" })}
          />
        </nav>

        <div className="operator-card" aria-label="Operatore corrente">
          <div className="avatar">DU</div>
          <div>
            <strong>Default User</strong>
            <span>Responsabile Tecnico</span>
          </div>
          <ChevronDown size={17} />
        </div>
      </aside>

      <div className={`content-shell ${editorMode ? "editor-layout" : ""}`}>
        {!editorMode && (
          <header className="topbar">
            <label className="search-field global-search">
              <Search size={18} />
              <input
                id="global-search"
                aria-label="Cerca aziende, immobili o studi"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca aziende, immobili, studi..."
              />
              <kbd>Ctrl K</kbd>
            </label>

            <button className="date-picker" disabled title="Filtro periodo in preparazione">
              <CalendarDays size={18} />
              01 Mag 2026 - 31 Mag 2026
              <ChevronDown size={15} />
            </button>

            <div className="top-icons">
              <button className="icon-button notification" title="Notifiche in preparazione" disabled aria-label="Notifiche in preparazione">
                <Bell size={19} />
                <span>8</span>
              </button>
              <button className="icon-button" title="Aiuto in preparazione" disabled aria-label="Aiuto in preparazione">
                <CircleHelp size={19} />
              </button>
              <button className="icon-button" title="Impostazioni" onClick={() => onNavigate({ view: "settings" })} aria-label="Impostazioni">
                <SlidersHorizontal size={19} />
              </button>
              <button className="icon-button" title="Altre azioni in preparazione" disabled aria-label="Altre azioni in preparazione">
                <MoreVertical size={19} />
              </button>
            </div>
          </header>
        )}
        {children}
      </div>

      <div className="deploy-version-badge" aria-label={`Versione deploy ${APP_DEPLOY_VERSION}`}>
        v{APP_DEPLOY_VERSION}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function NavItem({
  icon,
  label,
  active = false,
  disabled = false,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      title={title ?? label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSort: SortKey;
  direction: "asc" | "desc";
  onSort: (sortKey: SortKey) => void;
}) {
  const active = activeSort === sortKey;
  return (
    <th aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button className={`sort-header ${active ? "active" : ""}`} onClick={() => onSort(sortKey)}>
        {label}
        {active ? (
          direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        ) : (
          <ArrowDownUp size={13} />
        )}
      </button>
    </th>
  );
}

function PropertiesPage({
  studies,
  onOpenStudy,
  onOpenEditor,
  onOutcomeChange,
}: {
  studies: FeasibilityStudy[];
  onOpenStudy: (study: FeasibilityStudy) => void;
  onOpenEditor: (study: FeasibilityStudy, property: PropertyItem) => void;
  onOutcomeChange: (propertyId: string, outcome: PropertyOutcome) => Promise<boolean>;
}) {
  const properties = studies.flatMap((study) =>
    study.properties.map((property) => ({ property, study })),
  );

  return (
    <main className="detail-page">
      <section className="detail-hero section-hero">
        <div>
          <p className="eyebrow">Archivio immobili</p>
          <h1>Immobili da analizzare</h1>
          <p>{properties.length} immobili associati agli studi importati nella demo corrente.</p>
        </div>
      </section>
      <section className="detail-card property-detail-card properties-index">
        <div className="section-title">
          <h2>Planimetrie e analisi</h2>
          <span>Seleziona un immobile per aprire l'editor</span>
        </div>
        <div className="compact-table-wrap">
          <table className="compact-table">
            <thead>
              <tr>
                <th>Ubicazione</th>
                <th>Foglio</th>
                <th>Part.</th>
                <th>Sub</th>
                <th>Azienda</th>
                <th>Categoria</th>
                <th>Rendita attuale</th>
                <th>Esito</th>
                <th>Studio</th>
                <th>Planimetria</th>
              </tr>
            </thead>
            <tbody>
              {properties.map(({ property, study }) => (
                <tr key={`${study.id}-${property.id}`}>
                  <td>
                    <div className="company-cell">
                      <strong>{property.address}</strong>
                      <span>{property.comune}</span>
                    </div>
                  </td>
                  <td>{property.foglio || "In attesa ERP"}</td>
                  <td>{property.particella || "In attesa ERP"}</td>
                  <td>{property.subalterno || "In attesa ERP"}</td>
                  <td>{study.company}</td>
                  <td>{property.categoria}</td>
                  <td>{formatEuro(property.currentRendita)}</td>
                  <td>
                    <OutcomeSelect
                      outcome={property.outcome}
                      onChange={(outcome) => onOutcomeChange(property.id, outcome)}
                    />
                  </td>
                  <td>
                    <button className="inline-link" onClick={() => onOpenStudy(study)}>
                      {study.id}
                    </button>
                  </td>
                  <td>
                    <button className="button secondary compact-button" onClick={() => onOpenEditor(study, property)}>
                      <File size={14} />
                      Apri editor
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function SettingsPage({ appVersion, onNotice }: { appVersion: string; onNotice: (message: string) => void }) {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [backupBusy, setBackupBusy] = useState(false);
  const [preferences, setPreferences] = useState<EditorPreferences>(() => readEditorPreferences());

  useEffect(() => {
    void refreshSystemStatus();
  }, []);

  async function refreshSystemStatus() {
    setLoadingStatus(true);
    try {
      const response = await fetch(`${API_BASE_URL}/system/status`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSystemStatus((await response.json()) as SystemStatus);
    } catch {
      onNotice("Impossibile leggere lo stato sistema.");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function createBackupNow() {
    setBackupBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/system/backups`, { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const backup = (await response.json()) as SystemBackupInfo;
      onNotice(backup.uploaded ? "Backup creato e caricato su B2." : "Backup creato localmente; upload B2 non configurato.");
      await refreshSystemStatus();
    } catch {
      onNotice("Backup manuale non riuscito.");
    } finally {
      setBackupBusy(false);
    }
  }

  function updatePreferences(next: EditorPreferences) {
    setPreferences(normalizeEditorPreferences(next));
  }

  function savePreferences() {
    setPreferences(writeEditorPreferences(preferences));
    onNotice("Preferenze editor salvate.");
  }

  function resetPreferences() {
    setPreferences(resetEditorPreferences());
    onNotice("Preferenze editor ripristinate.");
  }

  return (
    <main className="detail-page settings-page">
      <section className="detail-hero section-hero settings-hero">
        <div>
          <p className="eyebrow">Configurazione PQ</p>
          <h1>Impostazioni</h1>
          <p>Preferenze operative dell'editor, stato storage, backup e integrazioni collegate.</p>
        </div>
        <button className="button secondary" onClick={() => void refreshSystemStatus()} disabled={loadingStatus}>
          <RefreshCw size={17} />
          Aggiorna stato
        </button>
      </section>

      <section className="settings-grid">
        <div className="detail-card settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Deploy e integrazioni</h2>
              <p>Versione corrente e servizi applicativi principali.</p>
            </div>
            <span className="settings-version">v{appVersion}</span>
          </div>
          <div className="settings-kv-grid">
            <SettingsValue label="Ambiente" value={systemStatus?.environment ?? "Non disponibile"} />
            <SettingsValue label="ERP sync token" value={configuredLabel(systemStatus?.integrations.erpSyncTokenConfigured)} />
            <SettingsValue label="OpenRouter/Qwen" value={configuredLabel(systemStatus?.integrations.openRouterConfigured)} />
            <SettingsValue label="Neuralwatt CAPTCHA" value={configuredLabel(systemStatus?.integrations.neuralwattConfigured)} />
            <SettingsValue label="Auth utenti" value={systemStatus?.integrations.authentication === "not-configured" ? "Non configurata" : "Configurata"} />
            <SettingsValue label="Modello scala" value={systemStatus?.integrations.scaleModel ?? "qwen/qwen3.5-flash-02-23"} />
            <SettingsValue label="Modello visure" value={systemStatus?.integrations.visuraModel ?? "qwen/qwen3.5-flash-02-23"} />
            <SettingsValue label="Modello CAPTCHA" value={systemStatus?.integrations.neuralwattModel ?? "qwen3.6-35b-fast"} />
            <SettingsValue label="OCR PDF" value={systemStatus?.integrations.pdfEngine ?? "mistral-ocr"} />
            <SettingsValue label="Stato letto" value={systemStatus ? formatDateTime(systemStatus.generatedAt) : "Caricamento"} />
          </div>
          <div className="settings-inline-actions">
            <a className="button secondary compact-button" href="/formaps-open/" target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              Helper forMaps
            </a>
            <a className="button secondary compact-button" href="/formaps-open/formaps-open-extension.zip" download>
              <Download size={15} />
              Scarica estensione
            </a>
          </div>
          <p className="settings-note">L'estensione usa l'endpoint PQ della stessa origine per leggere il CAPTCHA con Neuralwatt/Qwen.</p>
        </div>

        <div className="detail-card settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Default scala editor</h2>
              <p>Applicati ai nuovi editor quando non esiste una bozza o una scala AI.</p>
            </div>
          </div>
          <div className="settings-form-grid">
            <label>
              <span>Formato foglio</span>
              <select
                value={preferences.scale.sheetSize}
                onChange={(event) =>
                  updatePreferences({
                    ...preferences,
                    scale: { ...preferences.scale, sheetSize: event.target.value === "A4" ? "A4" : "A3" },
                  })
                }
              >
                <option value="A3">A3</option>
                <option value="A4">A4</option>
              </select>
            </label>
            <label>
              <span>Scala iniziale</span>
              <input
                type="number"
                min={20}
                max={20000}
                value={preferences.scale.denominator}
                onChange={(event) =>
                  updatePreferences({
                    ...preferences,
                    scale: { ...preferences.scale, denominator: Number(event.target.value) },
                  })
                }
              />
            </label>
          </div>
          <p className="settings-note">La scala AI continua a prevalere quando viene rilevata; le modifiche manuali dell'utente restano prioritarie.</p>
        </div>

        <div className="detail-card settings-card settings-card-wide">
          <div className="settings-card-header">
            <div>
              <h2>Default selezione smart</h2>
              <p>Valori iniziali dello strumento di selezione aree e inclusione muri.</p>
            </div>
            <div className="settings-actions">
              <button className="button secondary compact-button" type="button" onClick={resetPreferences}>
                Ripristina
              </button>
              <button className="button primary compact-button" type="button" onClick={savePreferences}>
                <Save size={15} />
                Salva
              </button>
            </div>
          </div>
          <div className="settings-form-grid smart-settings-grid">
            <SettingsNumberInput
              label="Soglia"
              min={0}
              max={255}
              value={preferences.smartSelection.threshold}
              onChange={(threshold) =>
                updatePreferences({ ...preferences, smartSelection: { ...preferences.smartSelection, threshold } })
              }
            />
            <SettingsNumberInput
              label="Inflate"
              min={0}
              max={12}
              value={preferences.smartSelection.inflate}
              onChange={(inflate) =>
                updatePreferences({ ...preferences, smartSelection: { ...preferences.smartSelection, inflate } })
              }
            />
            <SettingsNumberInput
              label="Gap"
              min={0}
              max={24}
              value={preferences.smartSelection.gap}
              onChange={(gap) =>
                updatePreferences({ ...preferences, smartSelection: { ...preferences.smartSelection, gap } })
              }
            />
            <SettingsNumberInput
              label="Dash"
              min={0}
              max={120}
              value={preferences.smartSelection.dash}
              onChange={(dash) =>
                updatePreferences({ ...preferences, smartSelection: { ...preferences.smartSelection, dash } })
              }
            />
            <label>
              <span>Inclusione muri area</span>
              <input
                type="number"
                min={0}
                max={8}
                disabled={preferences.smartSelection.wallInclusionRadius === null}
                value={preferences.smartSelection.wallInclusionRadius ?? DEFAULT_EDITOR_PREFERENCES.smartSelection.wallInclusionRadius ?? 3}
                onChange={(event) =>
                  updatePreferences({
                    ...preferences,
                    smartSelection: { ...preferences.smartSelection, wallInclusionRadius: Number(event.target.value) },
                  })
                }
              />
            </label>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={preferences.smartSelection.wallInclusionRadius === null}
                onChange={(event) =>
                  updatePreferences({
                    ...preferences,
                    smartSelection: {
                      ...preferences.smartSelection,
                      wallInclusionRadius: event.target.checked ? null : DEFAULT_EDITOR_PREFERENCES.smartSelection.wallInclusionRadius,
                    },
                  })
                }
              />
              Automatico
            </label>
          </div>
          <p className="settings-note">I default salvati sono locali al browser e vengono usati dai nuovi editor aperti dopo il salvataggio.</p>
        </div>

        <div className="detail-card settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Storage S3/B2</h2>
              <p>Configurazione documenti, prezzari e backup remoti.</p>
            </div>
            <StatusPill ok={Boolean(systemStatus?.storage.configured)} label={systemStatus?.storage.configured ? "Collegato" : "Non configurato"} />
          </div>
          <div className="settings-kv-grid">
            <SettingsValue label="Bucket" value={systemStatus?.storage.bucket ?? "Non disponibile"} />
            <SettingsValue label="Endpoint" value={systemStatus?.storage.endpointHost ?? "Non disponibile"} />
            <SettingsValue label="Regione" value={systemStatus?.storage.region ?? "Non disponibile"} />
            <SettingsValue label="Prefisso documenti" value={systemStatus?.storage.keyPrefix ?? "erp"} />
            <SettingsValue label="Prefisso backup" value={systemStatus?.storage.backupRemotePrefix ?? "backups/postgres"} />
            <SettingsValue label="Path style" value={systemStatus?.storage.forcePathStyle ? "Attivo" : "Disattivo"} />
          </div>
        </div>

        <div className="detail-card settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Backup database</h2>
              <p>Dump PostgreSQL locali e caricamento remoto su B2.</p>
            </div>
            <button className="button primary compact-button" onClick={() => void createBackupNow()} disabled={backupBusy || systemStatus?.backup.running}>
              <Upload size={15} />
              {backupBusy || systemStatus?.backup.running ? "Backup..." : "Backup ora"}
            </button>
          </div>
          <div className="settings-kv-grid">
            <SettingsValue label="Ultimo backup" value={systemStatus?.backup.latest ? formatDateTime(systemStatus.backup.latest.createdAt) : "Nessun backup"} />
            <SettingsValue label="Dimensione" value={systemStatus?.backup.latest ? formatBytes(systemStatus.backup.latest.sizeBytes) : "N.d."} />
            <SettingsValue label="Upload B2" value={systemStatus?.backup.latest?.uploaded ? "Presente" : "Non verificato"} />
            <SettingsValue label="Backup giornaliero" value={`${systemStatus?.backup.schedule.timeLocal ?? "03:00"} (${systemStatus?.backup.schedule.timezone ?? "Europe/Rome"})`} />
            <SettingsValue label="Retention locale" value={`${systemStatus?.backup.schedule.retentionDays ?? 14} giorni`} />
            <SettingsValue label="Cartella locale" value={systemStatus?.backup.localDir ?? "/backups/postgres"} />
          </div>
          {systemStatus?.backup.latest && (
            <p className="settings-note">Remote key: {systemStatus.backup.latest.remoteKey}</p>
          )}
        </div>

        <div className="detail-card settings-card settings-card-wide">
          <div className="settings-card-header">
            <div>
              <h2>Database e contenuti</h2>
              <p>Stato operativo e volumi principali attualmente indicizzati.</p>
            </div>
            <StatusPill ok={Boolean(systemStatus?.database.connected)} label={systemStatus?.database.connected ? "Connesso" : "Non disponibile"} />
          </div>
          <div className="settings-stat-grid">
            <SettingsStat label="Studi" value={systemStatus?.database.studies ?? 0} />
            <SettingsStat label="Immobili" value={systemStatus?.database.properties ?? 0} />
            <SettingsStat label="Documenti" value={systemStatus?.database.documents ?? 0} />
            <SettingsStat label="Prezzari" value={systemStatus?.database.priceLists ?? 0} />
            <SettingsStat label="Bozze planimetrie" value={systemStatus?.database.planDrafts ?? 0} />
          </div>
        </div>
      </section>
    </main>
  );
}

function SettingsNumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SettingsValue({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="settings-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SettingsStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="settings-stat">
      <span>{label}</span>
      <strong>{value.toLocaleString("it-IT")}</strong>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`settings-status-pill ${ok ? "ok" : "warning"}`}>{label}</span>;
}

function PendingPage({
  title,
  description,
  onOpenStudies,
}: {
  title: string;
  description: string;
  onOpenStudies: () => void;
}) {
  return (
    <main className="detail-page pending-page">
      <section className="detail-hero section-hero">
        <div>
          <p className="eyebrow">Integrazione prevista</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button className="button primary" onClick={onOpenStudies}>
          <ClipboardList size={17} />
          Apri studi
        </button>
      </section>
      <section className="detail-card pending-state">
        <AlertTriangle size={24} />
        <strong>Funzione non ancora operativa</strong>
        <p>Questa sezione sarà abilitata quando i servizi applicativi richiesti saranno collegati.</p>
      </section>
    </main>
  );
}

function StudyRows({
  study,
  expanded,
  selected,
  propertyDetailsOpen,
  onSelect,
  onToggle,
  onTogglePropertyDetails,
  onOpenDetail,
  onOpenEditor,
  onUpdate,
  onOutcomeChange,
  onNotice,
}: {
  study: FeasibilityStudy;
  expanded: boolean;
  selected: boolean;
  propertyDetailsOpen: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onTogglePropertyDetails: () => void;
  onOpenDetail: () => void;
  onOpenEditor: (property: PropertyItem) => void;
  onUpdate: (input: StudyUpdate) => Promise<boolean>;
  onOutcomeChange: (propertyId: string, outcome: PropertyOutcome) => Promise<boolean>;
  onNotice: (message: string) => void;
}) {
  const counts = getCounts(study);
  const [savingStatus, setSavingStatus] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState(study.notes);

  useEffect(() => {
    if (!editingNotes) setNoteDraft(study.notes);
  }, [editingNotes, study.notes]);

  async function handleStatusChange(status: StudyStatus) {
    if (status === study.status) return;
    setSavingStatus(true);
    await onUpdate({ status });
    setSavingStatus(false);
  }

  async function saveNotes() {
    setSavingNotes(true);
    const saved = await onUpdate({ notes: noteDraft.trim() });
    setSavingNotes(false);
    if (saved) setEditingNotes(false);
  }

  function handleOpenDocument(property: PropertyItem, type: PropertyDocumentKind) {
    openPropertyDocument(property, type, onNotice);
  }

  return (
    <>
      <tr
        className={`study-row ${expanded ? "expanded" : ""}`}
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Comprimi" : "Espandi"} dettagli dello studio ${study.id}`}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <td className="selection-cell">
          <input
            type="checkbox"
            checked={selected}
            onClick={(event) => event.stopPropagation()}
            onChange={onSelect}
            aria-label={`Seleziona ${study.company}`}
          />
        </td>
        <td className="strong-cell">{study.id}</td>
        <td>
          <div className="company-cell">
            <strong>{study.company}</strong>
            <span>
              {study.comune} ({study.provincia}) - {study.vat}
            </span>
          </div>
        </td>
        <td>{study.properties.length}</td>
        <td>
          <StatusSelect
            status={study.status}
            saving={savingStatus}
            onChange={(status) => void handleStatusChange(status)}
          />
        </td>
        <td>{formatDate(study.importedAt)}</td>
        <td>
          <div className="date-stack">
            <strong>{formatDate(study.deadline)}</strong>
            {study.nextAppointment && <span>{formatDateTime(study.nextAppointment)}</span>}
          </div>
        </td>
        <td>
          <MoneyPercentStack amount={studyRenditaDiffAmount(study)} percent={studyRenditaDiffPercent(study)} favorableDirection="down" />
        </td>
        <td>
          <MoneyPercentStack amount={study.diffImu} percent={studyImuDiffPercent(study)} />
        </td>
        <td>{formatEuro(study.totalRendita)}</td>
        <td>
          <Owner owner={study.commercialOwner} />
        </td>
        <td className="row-action-cell">
          <button
            className="button secondary compact-button row-detail-button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetail();
            }}
          >
            <FileText size={15} />
            Apri studio di fattibilità
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="study-detail-row">
          <td colSpan={12}>
            <div className="expanded-panel">
              <section className="study-summary">
                <div className="section-title">
                  <h3>Riepilogo studio</h3>
                  <StatusBadge status={study.status} />
                </div>
                <div className="summary-grid">
                  <SummaryStat icon={<Building2 size={16} />} label="N. immobili" value={counts.total.toString()} />
                  <SummaryStat icon={<Factory size={16} />} label="In categoria D" value={counts.catD.toString()} />
                  <SummaryStat icon={<Euro size={16} />} label="Rendita totale" value={formatEuro(study.totalRendita)} />
                  <SummaryStat icon={<Factory size={16} />} label="Rendita categoria D" value={formatEuro(study.catDRendita)} />
                  <SummaryStat icon={<RefreshCw size={16} />} label="Importato ERP" value={formatDate(study.importedAt)} />
                  <SummaryStat icon={<CalendarDays size={16} />} label="Data creazione" value={formatDate(study.createdAt)} />
                  <SummaryStat icon={<CheckCircle2 size={16} />} label="Data esito" value={formatDate(study.concludedAt)} />
                  <SummaryStat icon={<BriefcaseBusiness size={16} />} label="Commerciale" value={study.commercialOwner} />
                  <SummaryStat icon={<UserRound size={16} />} label="Responsabile tecnico" value={study.technicalOwner} />
                </div>
                <div className="summary-footer">
                  <div className="notes-block">
                    <div className="notes-head">
                      <span>Note</span>
                      {!editingNotes && (
                        <button className="notes-edit" type="button" onClick={() => setEditingNotes(true)}>
                          <Pencil size={14} />
                          Modifica
                        </button>
                      )}
                    </div>
                    {editingNotes ? (
                      <>
                        <textarea
                          className="notes-input"
                          value={noteDraft}
                          maxLength={4000}
                          rows={3}
                          onChange={(event) => setNoteDraft(event.target.value)}
                        />
                        <div className="notes-actions">
                          <button
                            className="button secondary compact-button"
                            type="button"
                            onClick={() => {
                              setNoteDraft(study.notes);
                              setEditingNotes(false);
                            }}
                            disabled={savingNotes}
                          >
                            Annulla
                          </button>
                          <button
                            className="button primary compact-button"
                            type="button"
                            onClick={() => void saveNotes()}
                            disabled={savingNotes}
                          >
                            <Save size={15} />
                            {savingNotes ? "Salvataggio..." : "Salva note"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p>{study.notes || "Nessuna nota inserita."}</p>
                    )}
                  </div>
                  <div className="summary-actions">
                    <PresentationAction
                      study={study}
                      onNotice={onNotice}
                    />
                    <a className="button secondary" href={study.erpUrl} target="_blank" rel="noreferrer">
                      Link allo studio sull'ERP
                      <ExternalLink size={16} />
                    </a>
                    <button className="button primary" onClick={onOpenDetail}>
                      <FileText size={16} />
                      Apri studio di fattibilità
                    </button>
                  </div>
                </div>
              </section>

              <section className="property-overview">
                <div className="section-title property-overview-header">
                  <div className="property-overview-title">
                    <h3>Panoramica immobili</h3>
                    <div className="overview-status">
                      <span className="study-progress">
                        {counts.performed}/{counts.total} studi eseguiti
                      </span>
                      <div className="outcome-summary">
                        <span>
                          <i className="dot positive" />
                          {counts.positive} positivi
                        </span>
                        <span>
                          <i className="dot negative" />
                          {counts.negative} negativi
                        </span>
                        <span>
                          <i className="dot pending" />
                          {counts.pending} neutri
                        </span>
                      </div>
                    </div>
                  </div>
                  <button className="button secondary compact-button" onClick={onTogglePropertyDetails}>
                    {propertyDetailsOpen ? "Nascondi dettaglio immobili" : "Dettaglio immobili"}
                    {propertyDetailsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
                <div className="property-icons" aria-label="Esiti degli immobili">
                  {study.properties.map((property) => (
                    <div
                      key={property.id}
                      className={`property-tile ${outcomeClass(property.outcome)}`}
                      tabIndex={0}
                      aria-label={`Dettagli immobile ${property.address}, ${property.comune}`}
                    >
                      <span className="property-tile-symbol">
                        {property.categoria.startsWith("D/") ? <Factory size={20} /> : <Home size={20} />}
                      </span>
                      <PropertyDocumentAvailability property={property} compact />
                      <div className="property-tooltip" role="tooltip">
                        <strong>{property.address}</strong>
                        <small>{property.comune}</small>
                        <span className="tooltip-grid">
                          <span>
                            <em>Categoria</em>
                            <b>{property.categoria}</b>
                          </span>
                          <span>
                            <em>Rendita attuale</em>
                            <b>{formatEuro(property.currentRendita)}</b>
                          </span>
                          <span>
                            <em>Rendita stimata</em>
                            <b>{property.estimatedRendita ? formatEuro(property.estimatedRendita) : "Da stimare"}</b>
                          </span>
                          <span>
                            <em>Differenza rendita</em>
                            {property.hasStudy ? (
                              <Delta value={property.diffPercent} suffix="%" favorableDirection="down" />
                            ) : (
                              <b>Non disponibile</b>
                            )}
                          </span>
                          <span>
                            <em>Esito</em>
                            <b>{property.outcome}</b>
                          </span>
                        </span>
                        <div className="tooltip-documents">
                          <button
                            type="button"
                            disabled={!propertyDocumentUrl(property, "planimetria")}
                            title={
                              propertyDocumentUrl(property, "planimetria")
                                ? "Apri elaborato planimetrico"
                                : "Elaborato planimetrico non disponibile nello storage documentale"
                            }
                            onClick={() => handleOpenDocument(property, "planimetria")}
                          >
                            <File size={13} />
                            Elab. Planimetrico
                          </button>
                          <button
                            type="button"
                            disabled={!propertyDocumentUrl(property, "visura")}
                            title={
                              propertyDocumentUrl(property, "visura")
                                ? "Apri visura PDF"
                                : "Visura PDF non disponibile nello storage documentale"
                            }
                            onClick={() => handleOpenDocument(property, "visura")}
                          >
                            <FileText size={13} />
                            Visura PDF
                          </button>
                          <button
                            type="button"
                            disabled={!propertyDocumentUrl(property, "elenco_subalterni")}
                            title={
                              propertyDocumentUrl(property, "elenco_subalterni")
                                ? "Apri elenco subalterni PDF"
                                : "Elenco subalterni PDF non disponibile nello storage documentale"
                            }
                            onClick={() => handleOpenDocument(property, "elenco_subalterni")}
                          >
                            <ClipboardList size={13} />
                            Elenco subalterni
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {propertyDetailsOpen && (
                  <div className="property-table-inline">
                    <div className="section-title">
                      <h3>Dettaglio immobili ({counts.total})</h3>
                      <span>Documenti associati agli immobili</span>
                    </div>
                    <div className="compact-table-wrap">
                      <table className="compact-table">
                        <thead>
                          <tr>
                            <th>Ubicazione</th>
                            <th>Foglio</th>
                            <th>Part.</th>
                            <th>Sub</th>
                            <th>Categoria</th>
                            <th>Rendita attuale</th>
                            <th>Rendita proposta</th>
                            <th>Diff. rendita</th>
                            <th>Esito</th>
                            <th>Documenti</th>
                          </tr>
                        </thead>
                        <tbody>
                          {study.properties.map((property) => (
                            <PropertyRow
                              key={property.id}
                              property={property}
                              onOpenEditor={() => onOpenEditor(property)}
                              onOpenDocument={(type) => handleOpenDocument(property, type)}
                              onOutcomeChange={onOutcomeChange}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PropertyRow({
  property,
  onOpenEditor,
  onOpenDocument,
  onOutcomeChange,
}: {
  property: PropertyItem;
  onOpenEditor?: () => void;
  onOpenDocument?: (type: PropertyDocumentKind) => void;
  onOutcomeChange?: (propertyId: string, outcome: PropertyOutcome) => Promise<boolean>;
}) {
  const planimetriaUrl = propertyDocumentUrl(property, "planimetria");
  const visuraUrl = propertyDocumentUrl(property, "visura");
  const elencoSubalterniUrl = propertyDocumentUrl(property, "elenco_subalterni");

  return (
    <tr>
      <td>
        <div className="company-cell">
          <strong>{property.address}</strong>
          <span>{property.comune}</span>
        </div>
      </td>
      <td>{property.foglio || "In attesa ERP"}</td>
      <td>{property.particella || "In attesa ERP"}</td>
      <td>{property.subalterno || "In attesa ERP"}</td>
      <td>{property.categoria}</td>
      <td>{formatEuro(property.currentRendita)}</td>
      <td>{property.estimatedRendita ? formatEuro(property.estimatedRendita) : "Da stimare"}</td>
      <td>
        <MoneyPercentStack amount={propertyRenditaDiffAmount(property)} percent={propertyRenditaDiffPercent(property)} favorableDirection="down" />
      </td>
      <td>
        {onOutcomeChange ? (
          <OutcomeSelect outcome={property.outcome} onChange={(outcome) => onOutcomeChange(property.id, outcome)} />
        ) : (
          <OutcomeBadge outcome={property.outcome} />
        )}
      </td>
      <td>
        <div className="document-actions">
          <button onClick={onOpenEditor}>
            <File size={14} />
            Apri editor
          </button>
          <button
            disabled={!planimetriaUrl || !onOpenDocument}
            title={planimetriaUrl ? "Apri elaborato planimetrico" : "Elaborato planimetrico non disponibile nello storage documentale"}
            onClick={() => onOpenDocument?.("planimetria")}
          >
            <File size={14} />
            Elab. Planimetrico
          </button>
          <button
            disabled={!visuraUrl || !onOpenDocument}
            title={visuraUrl ? "Apri visura PDF" : "Visura PDF non disponibile nello storage documentale"}
            onClick={() => onOpenDocument?.("visura")}
          >
            <FileText size={14} />
            Visura PDF
          </button>
          <button
            disabled={!elencoSubalterniUrl || !onOpenDocument}
            title={
              elencoSubalterniUrl
                ? "Apri elenco subalterni PDF"
                : "Elenco subalterni PDF non disponibile nello storage documentale"
            }
            onClick={() => onOpenDocument?.("elenco_subalterni")}
          >
            <ClipboardList size={14} />
            Elenco subalterni
          </button>
        </div>
      </td>
    </tr>
  );
}

function PresentationAction({
  study,
  onNotice,
}: {
  study: FeasibilityStudy;
  onNotice: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>(() => defaultPresentationPropertyIds(study));
  const [latestDeck, setLatestDeck] = useState<PresentationDeck | null>(null);
  const [generatedDeck, setGeneratedDeck] = useState<PresentationDeck | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    fetch(`${API_BASE_URL}/studies/${encodeURIComponent(study.id)}/presentations`, {
      signal: abortController.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<PresentationDeck[]>;
      })
      .then((decks) => setLatestDeck(Array.isArray(decks) ? decks[0] ?? null : null))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Impossibile caricare le presentazioni dello studio", error);
        }
      });
    return () => abortController.abort();
  }, [study.id]);

  useEffect(() => {
    if (!modalOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setModalOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, modalOpen]);

  function openGenerator() {
    setMenuOpen(false);
    setSelectedPropertyIds(defaultPresentationPropertyIds(study));
    setGeneratedDeck(null);
    setModalOpen(true);
  }

  function toggleProperty(propertyId: string) {
    setSelectedPropertyIds((current) => current.includes(propertyId)
      ? current.filter((id) => id !== propertyId)
      : [...current, propertyId]);
  }

  async function generatePresentation() {
    if (selectedPropertyIds.length === 0 || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/studies/${encodeURIComponent(study.id)}/presentations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyIds: selectedPropertyIds }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(". ") : payload?.message;
        throw new Error(message || `HTTP ${response.status}`);
      }
      const deck = (await response.json()) as PresentationDeck;
      setGeneratedDeck(deck);
      setLatestDeck(deck);
      onNotice("Presentazione generata e salvata.");
    } catch (error) {
      console.error(error);
      onNotice(error instanceof Error ? error.message : "Impossibile generare la presentazione.");
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf(deck: PresentationDeck) {
    const link = document.createElement("a");
    link.href = deck.pdfUrl;
    link.click();
    onNotice("Generazione PDF avviata: il primo download può richiedere qualche secondo.");
  }

  async function copyDeckLink(deck: PresentationDeck) {
    const url = new URL(deck.htmlUrl, window.location.origin).toString();
    try {
      await copyText(url);
      onNotice("Link HTML copiato.");
    } catch {
      onNotice("Impossibile copiare il link: apri la presentazione e copia l'indirizzo dal browser.");
    }
  }

  return (
    <>
      <div className="split-action">
        <button
          className="button secondary split-primary"
          type="button"
          disabled={study.properties.length === 0}
          title={study.properties.length === 0 ? "Aggiungi almeno un immobile allo studio" : undefined}
          onClick={openGenerator}
        >
          <Presentation size={16} />
          Genera presentazione
        </button>
        <button
          className="button secondary split-toggle"
          type="button"
          disabled={!latestDeck}
          aria-label="Apri o scarica l'ultima presentazione"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <ChevronDown size={15} />
        </button>
        {menuOpen && latestDeck && (
          <div className="split-menu">
            <button type="button" onClick={() => window.open(latestDeck.htmlUrl, "_blank", "noopener,noreferrer")}>
              <ExternalLink size={15} />
              Apri ultima versione HTML
            </button>
            <button type="button" onClick={() => downloadPdf(latestDeck)}>
              <Download size={15} />
              Scarica ultima versione PDF
            </button>
            <button type="button" onClick={() => void copyDeckLink(latestDeck)}>
              <Copy size={15} />
              Copia link HTML
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setModalOpen(false);
          }}
        >
          <section
            className="editor-modal presentation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`presentation-title-${study.id}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id={`presentation-title-${study.id}`}>Genera presentazione cliente</h2>
                <p>{study.company} · {study.id}</p>
              </div>
              <button className="icon-button" type="button" disabled={busy} onClick={() => setModalOpen(false)} aria-label="Chiudi">
                <X size={16} />
              </button>
            </div>

            <p className="modal-note">
              Seleziona gli immobili da includere. La versione generata resta uno snapshot consultabile tramite link e scaricabile in PDF.
            </p>

            <div className="presentation-selection-toolbar">
              <strong>{selectedPropertyIds.length}/{study.properties.length} selezionati</strong>
              <div>
                <button type="button" onClick={() => setSelectedPropertyIds(study.properties.map((property) => property.id))}>Tutti</button>
                <button type="button" onClick={() => setSelectedPropertyIds(study.properties.filter((property) => property.outcome === "Positivo").map((property) => property.id))}>Solo positivi</button>
                <button type="button" onClick={() => setSelectedPropertyIds([])}>Nessuno</button>
              </div>
            </div>

            <div className="presentation-property-list">
              {study.properties.map((property) => {
                const incomplete = presentationPropertyHasIncompleteData(property);
                return (
                  <label key={property.id} className={selectedPropertyIds.includes(property.id) ? "selected" : ""}>
                    <input
                      type="checkbox"
                      checked={selectedPropertyIds.includes(property.id)}
                      onChange={() => toggleProperty(property.id)}
                    />
                    <div>
                      <strong>{propertyLocation(property)}</strong>
                      <span>
                        {property.id} · {property.categoria} · {cadastralPropertyReference(property)}
                      </span>
                      <small>
                        Rendita {formatEuro(property.currentRendita)} → {formatEstimatedValue(property.estimatedRendita)} · IMU {property.currentImu == null ? "n.d." : formatEuro(property.currentImu)} → {property.estimatedImu == null ? "n.d." : formatEuro(property.estimatedImu)}
                      </small>
                    </div>
                    <span className={`presentation-data-state ${incomplete ? "warning" : "ready"}`}>
                      {incomplete ? "Dati incompleti" : property.outcome}
                    </span>
                  </label>
                );
              })}
            </div>

            {generatedDeck && (
              <div className="presentation-ready-card">
                <div>
                  <CheckCircle2 size={19} />
                  <span>
                    <strong>Presentazione pronta</strong>
                    {generatedDeck.propertyCount} immobili · {formatDateTime(generatedDeck.createdAt)}
                  </span>
                </div>
                <div>
                  <a className="button secondary" href={generatedDeck.htmlUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} />
                    Apri HTML
                  </a>
                  <button className="button secondary" type="button" onClick={() => downloadPdf(generatedDeck)}>
                    <Download size={15} />
                    Scarica PDF
                  </button>
                  <button className="button secondary" type="button" onClick={() => void copyDeckLink(generatedDeck)}>
                    <Copy size={15} />
                    Copia link
                  </button>
                </div>
              </div>
            )}

            <div className="modal-actions presentation-modal-actions">
              <button className="button secondary" type="button" onClick={() => setModalOpen(false)} disabled={busy}>
                Chiudi
              </button>
              <button className="button primary" type="button" disabled={busy || selectedPropertyIds.length === 0} onClick={() => void generatePresentation()}>
                <Presentation size={15} />
                {busy ? "Generazione..." : generatedDeck ? "Genera nuova versione" : "Genera presentazione"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function defaultPresentationPropertyIds(study: FeasibilityStudy) {
  const positiveIds = study.properties
    .filter((property) => property.outcome === "Positivo")
    .map((property) => property.id);
  return positiveIds.length > 0 ? positiveIds : study.properties.map((property) => property.id);
}

function presentationPropertyHasIncompleteData(property: PropertyItem) {
  return property.estimatedRendita <= 0 || property.currentImu == null || property.estimatedImu == null;
}

function cadastralPropertyReference(property: PropertyItem) {
  const values = [
    property.foglio ? `Fg. ${property.foglio}` : null,
    property.particella ? `Part. ${property.particella}` : null,
    property.subalterno ? `Sub. ${property.subalterno}` : null,
  ].filter(Boolean);
  return values.length > 0 ? values.join(" · ") : "dati catastali non disponibili";
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard non disponibile");
}

function StudyDetail({
  study,
  onBack,
  onExport,
  onOpenEditor,
  onNotice,
  onUpdate,
  onReorder,
  onCreateProperty,
  onDeleteProperties,
  onPropertyEstimateChange,
  onImuOverridesSave,
  onOutcomeChange,
}: {
  study: FeasibilityStudy;
  onBack: () => void;
  onExport: () => void;
  onOpenEditor: (property: PropertyItem) => void;
  onNotice: (message: string) => void;
  onUpdate: (input: StudyUpdate) => Promise<boolean>;
  onReorder: (propertyIds: string[]) => Promise<boolean>;
  onCreateProperty: (form: NewPropertyFormState) => Promise<boolean>;
  onDeleteProperties: (propertyIds: string[]) => Promise<boolean>;
  onPropertyEstimateChange: (
    propertyId: string,
    estimatedRendita: number,
    estimatedImu?: number | null,
    imuCalculation?: PropertyImuCalculation | null,
  ) => void;
  onImuOverridesSave: (
    propertyId: string,
    patch: { imuRateOverride?: number | null; imuMultiplierOverride?: number | null },
  ) => Promise<PropertyImuOverrideUpdate>;
  onOutcomeChange: (propertyId: string, outcome: PropertyOutcome) => Promise<boolean>;
}) {
  const counts = getCounts(study);
  const positiveShare = Math.round((counts.positive / Math.max(counts.total, 1)) * 100);
  const [savingStatus, setSavingStatus] = useState(false);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [propertySortKey, setPropertySortKey] = useState<PropertySortKey>("manual");
  const [propertySortDirection, setPropertySortDirection] = useState<"asc" | "desc">("asc");
  const [manualOrder, setManualOrder] = useState<string[]>(() => study.properties.map((property) => property.id));
  const [draggedPropertyId, setDraggedPropertyId] = useState("");
  const [activePropertyId, setActivePropertyId] = useState<string | null>(null);
  const [newPropertyModalOpen, setNewPropertyModalOpen] = useState(false);
  const [newPropertyBusy, setNewPropertyBusy] = useState(false);
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<string[]>([]);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setSelectedPropertyIds([]);
    setPropertySortKey("manual");
    setManualOrder(study.properties.map((property) => property.id));
    setActivePropertyId(null);
    setNewPropertyModalOpen(false);
    setDeleteConfirmIds([]);
  }, [study.id]);

  useEffect(() => {
    setManualOrder((current) => {
      const existingIds = new Set(study.properties.map((property) => property.id));
      const retained = current.filter((propertyId) => existingIds.has(propertyId));
      const added = study.properties.map((property) => property.id).filter((propertyId) => !retained.includes(propertyId));
      return [...retained, ...added];
    });
  }, [study.properties]);

  const orderedProperties = useMemo(() => {
    const byId = new Map(study.properties.map((property) => [property.id, property]));
    const properties = manualOrder.map((propertyId) => byId.get(propertyId)).filter((property): property is PropertyItem => Boolean(property));
    if (propertySortKey === "manual") return properties;

    return [...properties].sort((first, second) => {
      const values: Record<Exclude<PropertySortKey, "manual">, [string | number, string | number]> = {
        ubicazione: [propertyLocation(first), propertyLocation(second)],
        foglio: [first.foglio ?? "", second.foglio ?? ""],
        particella: [first.particella ?? "", second.particella ?? ""],
        subalterno: [first.subalterno ?? "", second.subalterno ?? ""],
        categoria: [first.categoria, second.categoria],
        currentRendita: [first.currentRendita, second.currentRendita],
        estimatedRendita: [first.estimatedRendita, second.estimatedRendita],
        renditaDiff: [propertyRenditaDiffAmount(first) ?? -Infinity, propertyRenditaDiffAmount(second) ?? -Infinity],
        currentImu: [first.currentImu ?? -Infinity, second.currentImu ?? -Infinity],
        estimatedImu: [first.estimatedImu ?? -Infinity, second.estimatedImu ?? -Infinity],
        imuDiff: [propertyImuDiffAmount(first) ?? -Infinity, propertyImuDiffAmount(second) ?? -Infinity],
        titolarita: [formatTitolarita(first.titolarita, ""), formatTitolarita(second.titolarita, "")],
        outcome: [first.outcome, second.outcome],
      };
      const [left, right] = values[propertySortKey];
      const comparison =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right, "it")
          : Number(left) - Number(right);
      return propertySortDirection === "asc" ? comparison : -comparison;
    });
  }, [manualOrder, propertySortDirection, propertySortKey, study.properties]);

  const selectedProperties = orderedProperties.filter((property) => selectedPropertyIds.includes(property.id));
  const allPropertiesSelected =
    orderedProperties.length > 0 &&
    orderedProperties.every((property) => selectedPropertyIds.includes(property.id));
  const activeProperty =
    orderedProperties.find((property) => property.id === activePropertyId) ?? null;
  const [activeAreaDraftState, setActiveAreaDraft] = usePlanAreaDraft(activeProperty?.id ?? null);

  useEffect(() => {
    if (activePropertyId && !study.properties.some((property) => property.id === activePropertyId)) {
      setActivePropertyId(null);
    }
  }, [activePropertyId, study.properties]);

  async function handleStatusChange(status: StudyStatus) {
    if (status === study.status) return;
    setSavingStatus(true);
    await onUpdate({ status });
    setSavingStatus(false);
  }

  function handlePropertySort(sortKey: Exclude<PropertySortKey, "manual">) {
    if (propertySortKey === sortKey) {
      setPropertySortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setPropertySortKey(sortKey);
    setPropertySortDirection("asc");
  }

  function togglePropertySelection(propertyId: string) {
    setSelectedPropertyIds((current) =>
      current.includes(propertyId)
        ? current.filter((selectedId) => selectedId !== propertyId)
        : [...current, propertyId],
    );
  }

  function toggleAllProperties() {
    setSelectedPropertyIds((current) =>
      allPropertiesSelected
        ? current.filter((propertyId) => !orderedProperties.some((property) => property.id === propertyId))
        : Array.from(new Set([...current, ...orderedProperties.map((property) => property.id)])),
    );
  }

  function openSelected(service: "maps" | "earth" | "formaps") {
    if (service === "formaps") {
      const entries = toForMapsEntries(selectedProperties.map(propertyForMapsPayload));
      if (entries.length === 0) {
        onNotice("Nessun immobile selezionato ha provincia, comune, foglio e particella completi.");
        return;
      }
      openEntriesInForMaps(entries);
      if (entries.length < selectedProperties.length) {
        onNotice("Alcuni immobili selezionati non sono stati aperti perché mancano dati catastali completi.");
      }
      return;
    }

    selectedProperties.forEach((property) => {
      const url = service === "maps" ? googleMapsUrl(property) : googleEarthUrl(property);
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  function openPropertyInForMaps(property: PropertyItem) {
    const entry = toForMapsEntry(propertyForMapsPayload(property));
    if (!entry) {
      onNotice("Impossibile aprire forMaps: provincia, comune, foglio o particella mancanti.");
      return;
    }
    openEntriesInForMaps([entry]);
  }

  function propertyForMapsPayload(property: PropertyItem) {
    return property;
  }

  function handleOpenDocument(property: PropertyItem, type: PropertyDocumentKind) {
    openPropertyDocument(property, type, onNotice);
  }

  function handleDrop(targetPropertyId: string) {
    if (!draggedPropertyId || draggedPropertyId === targetPropertyId) {
      setDraggedPropertyId("");
      return;
    }
    const currentOrder = orderedProperties.map((property) => property.id);
    const nextOrder = currentOrder.filter((propertyId) => propertyId !== draggedPropertyId);
    const targetIndex = nextOrder.indexOf(targetPropertyId);
    nextOrder.splice(targetIndex, 0, draggedPropertyId);
    setManualOrder(nextOrder);
    setPropertySortKey("manual");
    setDraggedPropertyId("");
    void onReorder(nextOrder);
  }

  async function handleCreateProperty(form: NewPropertyFormState) {
    setNewPropertyBusy(true);
    const success = await onCreateProperty(form);
    setNewPropertyBusy(false);
    if (success) setNewPropertyModalOpen(false);
    return success;
  }

  async function confirmDeleteProperties() {
    if (deleteConfirmIds.length === 0 || deleteBusy) return;
    setDeleteBusy(true);
    const success = await onDeleteProperties(deleteConfirmIds);
    setDeleteBusy(false);
    if (success) {
      setSelectedPropertyIds((current) => current.filter((propertyId) => !deleteConfirmIds.includes(propertyId)));
      if (activePropertyId && deleteConfirmIds.includes(activePropertyId)) setActivePropertyId(null);
      setDeleteConfirmIds([]);
    }
  }

  return (
    <main className="detail-page">
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={17} />
        Torna agli studi
      </button>

      <section className="detail-hero">
        <div>
          <div className="detail-meta">
            <span>{study.id}</span>
            <StatusSelect
              status={study.status}
              saving={savingStatus}
              onChange={(status) => void handleStatusChange(status)}
            />
          </div>
          <h1>{study.company}</h1>
          <p>
            {study.comune} ({study.provincia}) - {study.vat}
          </p>
        </div>
        <div className="detail-actions">
          <PresentationAction
            study={study}
            onNotice={onNotice}
          />
          <button className="button secondary" onClick={onExport}>
            <FileSpreadsheet size={17} />
            Esporta immobili CSV
          </button>
          <a className="button secondary" href={study.erpUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={17} />
            Link allo studio sull'ERP
          </a>
          <button className="button primary" disabled title="Disponibile dopo integrazione ERP">
            <Send size={17} />
            Invia a ERP
          </button>
        </div>
      </section>

      <section className="detail-card property-detail-card operational-properties">
        <div className="section-title property-list-title">
          <div>
            <h2>Immobili dello studio</h2>
            <span>{counts.total} immobili, di cui {counts.catD} in categoria D</span>
          </div>
          <div className="property-list-actions">
            <span className="manual-order-indicator">
              <GripVertical size={15} />
              {propertySortKey === "manual" ? "Ordine manuale" : "Trascina per salvare un nuovo ordine"}
            </span>
            <button className="button primary compact-button" type="button" onClick={() => setNewPropertyModalOpen(true)}>
              <Plus size={15} />
              Aggiungi immobile
            </button>
            <button
              className="button secondary compact-button danger-soft-button"
              type="button"
              disabled={selectedProperties.length === 0}
              onClick={() => setDeleteConfirmIds(selectedProperties.map((property) => property.id))}
            >
              <Trash2 size={15} />
              Elimina selezionati
            </button>
          </div>
        </div>

        <div className="property-selection-toolbar" aria-label="Azioni immobili selezionati">
          <span>
            {selectedProperties.length > 0
              ? `${selectedProperties.length} immobili selezionati`
              : "Seleziona uno o più immobili per azioni multiple"}
          </span>
          <button
            className="button secondary compact-button"
            disabled={selectedProperties.length === 0}
            onClick={() => openSelected("formaps")}
          >
            <Building2 size={15} />
            Apri in forMaps
          </button>
          <button
            className="button secondary compact-button"
            disabled={selectedProperties.length === 0}
            onClick={() => openSelected("earth")}
          >
            <Globe size={15} />
            Google Earth
          </button>
          <button
            className="button secondary compact-button"
            disabled={selectedProperties.length === 0}
            onClick={() => openSelected("maps")}
          >
            <MapPin size={15} />
            Google Maps
          </button>
        </div>

        <div className="compact-table-wrap">
          <table className="compact-table property-operational-table">
            <thead>
              <tr>
                <th className="property-select-cell">
                  <input
                    type="checkbox"
                    checked={allPropertiesSelected}
                    onChange={toggleAllProperties}
                    aria-label="Seleziona tutti gli immobili"
                  />
                </th>
                <th className="property-drag-cell" aria-label="Ordine manuale" />
                <PropertySortHeader label="Ubicazione" sortKey="ubicazione" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Foglio" sortKey="foglio" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Part." sortKey="particella" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Sub" sortKey="subalterno" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Categoria" sortKey="categoria" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Rendita attuale" sortKey="currentRendita" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Rendita proposta" sortKey="estimatedRendita" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Diff. rendita" sortKey="renditaDiff" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="IMU attuale" sortKey="currentImu" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="IMU prevista" sortKey="estimatedImu" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Diff. IMU" sortKey="imuDiff" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <th>Documenti</th>
                <PropertySortHeader label="Titolarità" sortKey="titolarita" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Esito" sortKey="outcome" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
              </tr>
            </thead>
            <tbody>
              {orderedProperties.map((property) => {
                const imuPercent = deviationPercent(property.currentImu, property.estimatedImu);
                return (
                  <tr
                    key={property.id}
                    className={`${draggedPropertyId === property.id ? "dragging" : ""} ${activePropertyId === property.id ? "active-property-detail" : ""}`}
                    onClick={() => setActivePropertyId(property.id)}
                    aria-selected={activePropertyId === property.id}
                    title="Apri dettaglio lista aree"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(property.id);
                    }}
                  >
                    <td className="property-select-cell">
                      <input
                        type="checkbox"
                        checked={selectedPropertyIds.includes(property.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => togglePropertySelection(property.id)}
                        aria-label={`Seleziona ${propertyLocation(property)}`}
                      />
                    </td>
                    <td className="property-drag-cell">
                      <button
                        className="drag-handle"
                        type="button"
                        draggable
                        onClick={(event) => event.stopPropagation()}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", property.id);
                          setDraggedPropertyId(property.id);
                        }}
                        onDragEnd={() => setDraggedPropertyId("")}
                        aria-label={`Riordina ${propertyLocation(property)}`}
                        title="Trascina per riordinare"
                      >
                        <GripVertical size={17} />
                      </button>
                    </td>
                    <td className="location-cell">
                      <strong>{propertyLocation(property)}</strong>
                    </td>
                    <td>{property.foglio || "In attesa ERP"}</td>
                    <td>{property.particella || "In attesa ERP"}</td>
                    <td>{property.subalterno || "In attesa ERP"}</td>
                    <td>{property.categoria}</td>
                    <td>{formatEuro(property.currentRendita)}</td>
                    <td>
                      {formatEstimatedValue(property.estimatedRendita)}
                    </td>
                    <td>
                      <MoneyPercentStack amount={propertyRenditaDiffAmount(property)} percent={propertyRenditaDiffPercent(property)} favorableDirection="down" />
                    </td>
                    <td><ImuCurrent property={property} /></td>
                    <td><ImuEstimate property={property} /></td>
                    <td>
                      <MoneyPercentStack amount={propertyImuDiffAmount(property)} percent={imuPercent} />
                    </td>
                    <td><PropertyDocumentAvailability property={property} /></td>
                    <td>{formatTitolarita(property.titolarita)}</td>
                    <td>
                      <OutcomeSelect
                        outcome={property.outcome}
                        onChange={(outcome) => onOutcomeChange(property.id, outcome)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {orderedProperties.length === 0 && (
            <div className="empty-state">
              <Building2 size={22} />
              <strong>Nessun immobile nello studio</strong>
              <span>Aggiungi uno o più immobili per iniziare analisi e caricamento documenti.</span>
            </div>
          )}
        </div>
      </section>
      {newPropertyModalOpen && (
        <NewPropertyModal
          study={study}
          busy={newPropertyBusy}
          onClose={() => setNewPropertyModalOpen(false)}
          onCreate={handleCreateProperty}
        />
      )}
      {deleteConfirmIds.length > 0 && (
        <ConfirmDeletePropertiesModal
          busy={deleteBusy}
          count={deleteConfirmIds.length}
          onClose={() => setDeleteConfirmIds([])}
          onConfirm={() => void confirmDeleteProperties()}
        />
      )}
      {activeProperty && (
        <PropertyAreaDetail
          property={activeProperty}
          draftState={activeAreaDraftState}
          onDraftSaved={(draft, source, error) => {
            setActiveAreaDraft(draft, source, error);
            const estimatedRendita = planAreaEstimatedRenditaFromDraft(draft);
            if (estimatedRendita !== null) {
              onPropertyEstimateChange(
                activeProperty.id,
                estimatedRendita,
                draft.estimatedImu,
                draft.imuCalculation,
              );
            }
          }}
          onOpenEditor={() => onOpenEditor(activeProperty)}
          canOpenForMaps={Boolean(toForMapsEntry(propertyForMapsPayload(activeProperty)))}
          onOpenForMaps={() => openPropertyInForMaps(activeProperty)}
          onOpenDocument={(type) => handleOpenDocument(activeProperty, type)}
          onImuOverridesSave={onImuOverridesSave}
          onMissing={onNotice}
          onClose={() => setActivePropertyId(null)}
        />
      )}

      <section className="detail-metrics">
        <DetailMetric
          icon={<Building2 size={22} />}
          label="Immobili"
          value={counts.total.toString()}
          supplementaryLabel="Dei quali in categoria D"
          supplementaryValue={counts.catD.toString()}
        />
        <DetailMetric
          icon={<CircleDollarSign size={22} />}
          label="Rendita totale"
          value={formatEuro(study.totalRendita)}
          supplementaryLabel="Rendita in categoria D"
          supplementaryValue={formatEuro(study.catDRendita)}
        />
        <DetailMetric
          icon={study.diffRendita >= 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
          label="Differenza rendita"
          value={formatPercent(study.diffRendita)}
          positive={study.diffRendita <= 0}
        />
        <DetailMetric
          icon={<Euro size={22} />}
          label="Differenza IMU totale"
          value={formatEuro(study.diffImu)}
          positive={study.diffImu >= 0}
        />
      </section>

      <section className="detail-columns">
        <div className="detail-card">
          <div className="section-title">
            <h2>Avanzamento immobili</h2>
            <span>{positiveShare}% positivi</span>
          </div>
          <div className="progress-large">
            <div style={{ width: `${Math.min(positiveShare, 100)}%` }} />
          </div>
          <div className="outcome-grid">
            <SummaryStat label="Studi eseguiti" value={`${counts.performed}/${counts.total}`} />
            <SummaryStat label="Positivi" value={counts.positive.toString()} />
            <SummaryStat label="Negativi" value={counts.negative.toString()} />
            <SummaryStat label="Neutri" value={counts.pending.toString()} />
          </div>
        </div>

        <div className="detail-card">
          <div className="section-title">
            <h2>Dati responsabilità</h2>
          </div>
          <div className="responsibility-list">
            <Owner owner={study.commercialOwner} label="Commerciale" />
            <Owner owner={study.technicalOwner} label="Responsabile tecnico" />
            <div className="responsibility-row">
              <Clock3 size={18} />
              <div>
                <span>Scadenza</span>
                <strong>{formatDate(study.deadline)}</strong>
              </div>
            </div>
            <div className="responsibility-row">
              <CalendarDays size={18} />
              <div>
                <span>Prossimo appuntamento</span>
                <strong>{formatDateTime(study.nextAppointment)}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}

function PropertyAreaDetail({
  property,
  draftState,
  onDraftSaved,
  onOpenEditor,
  canOpenForMaps,
  onOpenForMaps,
  onOpenDocument,
  onImuOverridesSave,
  onMissing,
  onClose,
}: {
  property: PropertyItem;
  draftState: PlanAreaDraftState;
  onDraftSaved: (draft: PlanAreaDraft, source?: PlanAreaDraftState["source"], error?: boolean) => void;
  onOpenEditor: () => void;
  canOpenForMaps: boolean;
  onOpenForMaps: () => void;
  onOpenDocument: (type: PropertyDocumentKind) => void;
  onImuOverridesSave: (
    propertyId: string,
    patch: { imuRateOverride?: number | null; imuMultiplierOverride?: number | null },
  ) => Promise<PropertyImuOverrideUpdate>;
  onMissing: (message: string) => void;
  onClose: () => void;
}) {
  const [editableDraft, setEditableDraft] = useState<PlanAreaDraft | null>(() =>
    draftState.draft ? clonePlanAreaDraft(draftState.draft) : null,
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditableDraft(draftState.draft ? clonePlanAreaDraft(draftState.draft) : null);
    setDirty(false);
  }, [draftState.draft?.propertyId, draftState.draft?.savedAt]);

  const draft = editableDraft;
  const rows = useMemo(() => {
    if (!draft) return [];
    return draft.selections.map((selection, index) => {
      const usage = planAreaUsageForSelection(selection);
      const rate = selection.rate ?? usage.rate;
      const calculatedArea = planAreaFromPixels(selection, draft);
      const area = planAreaEffectiveAreaM2(selection, draft);
      const calculatedAmount = area * rate;
      const amount = planAreaEffectiveAmount(selection, draft);
      const lotValue = planAreaLotValue(selection, draft);
      return {
        id: selection.id,
        index: index + 1,
        page: selection.page,
        selection,
        usage,
        rate,
        area,
        calculatedArea,
        amount,
        calculatedAmount,
        lotValue,
        totalAmount: planAreaTotalAmount(selection, draft),
        areaOverridden: typeof selection.areaOverrideM2 === "number" && Number.isFinite(selection.areaOverrideM2),
        amountOverridden: typeof selection.amountOverride === "number" && Number.isFinite(selection.amountOverride),
        source: planAreaSourceLabel(selection.source),
      };
    });
  }, [draft]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.area += row.area;
          acc.baseAmount += row.amount;
          acc.lotArea += row.selection.includedInLot ? row.area : 0;
          acc.lotValue += row.lotValue;
          acc.amount += row.totalAmount;
          acc.rendita += planAreaEstimatedRenditaFromAmount(row.totalAmount);
          return acc;
        },
        { area: 0, baseAmount: 0, lotArea: 0, lotValue: 0, amount: 0, rendita: 0 },
      ),
    [rows],
  );

  const breakdown = useMemo(
    () => {
      const byUsage = new Map<string, { usage: (typeof rows)[number]["usage"]; area: number }>();
      rows.forEach((row) => {
        const key = `${row.usage.id}:${row.usage.label}`;
        const current = byUsage.get(key);
        if (current) current.area += row.area;
        else byUsage.set(key, { usage: row.usage, area: row.area });
      });
      return Array.from(byUsage.values()).filter((item) => item.area > 0);
    },
    [rows],
  );

  const sourceLabel =
    draftState.source === "database"
      ? "Bozza database"
      : draftState.source === "local"
        ? "Bozza locale"
        : "Nessuna bozza";
  const topPriceLists = property.priceLists?.slice(0, 5) ?? [];
  const primaryPriceList = topPriceLists[0];
  const lotValuation = normalizeLotValuation(draft?.lotValuation);

  function updateEditableDraft(updater: (draft: PlanAreaDraft) => void) {
    setEditableDraft((current) => {
      if (!current) return current;
      const next = clonePlanAreaDraft(current);
      updater(next);
      return recalculatePlanAreaDraftTotals(next);
    });
    setDirty(true);
  }

  function updateEditableSelection(selectionId: string, updater: (selection: PlanAreaDraftSelection, draft: PlanAreaDraft) => void) {
    updateEditableDraft((nextDraft) => {
      const selection = nextDraft.selections.find((item) => item.id === selectionId);
      if (!selection) return;
      updater(selection, nextDraft);
    });
  }

  function handleUsageChange(selectionId: string, value: string) {
    updateEditableSelection(selectionId, (selection, nextDraft) => {
      if (value.startsWith("fixed:")) {
        const usage = planAreaUsageById(value.slice("fixed:".length));
        selection.usageId = usage.id;
        selection.customUsageId = undefined;
        selection.customUsageLabel = undefined;
        selection.color = usage.color;
        selection.rate = usage.rate;
        return;
      }
      if (value.startsWith("custom:")) {
        const customUsage = nextDraft.customUsages?.find((item) => item.id === value.slice("custom:".length));
        if (!customUsage) return;
        selection.usageId = PLAN_AREA_CUSTOM_USAGE_ID;
        selection.customUsageId = customUsage.id;
        selection.customUsageLabel = customUsage.label;
        selection.color = customUsage.color;
        selection.rate = customUsage.rate;
      }
    });
  }

  function handleNumberBlur(
    rawValue: string,
    fallback: number,
    onValid: (value: number) => void,
    input: HTMLInputElement,
    message: string,
  ) {
    const parsed = parseLocalizedNumberInput(rawValue);
    if (parsed === null || parsed < 0) {
      input.value = areaFormatter.format(fallback);
      onMissing(message);
      return;
    }
    onValid(parsed);
    input.value = areaFormatter.format(parsed);
  }

  function handleAreaBlur(row: (typeof rows)[number], input: HTMLInputElement) {
    handleNumberBlur(
      input.value,
      row.area,
      (value) =>
        updateEditableSelection(row.id, (selection) => {
          selection.areaOverrideM2 = Math.abs(value - row.calculatedArea) < 0.005 ? null : value;
        }),
      input,
      "Inserisci una superficie valida.",
    );
  }

  function handleRateBlur(row: (typeof rows)[number], input: HTMLInputElement) {
    handleNumberBlur(
      input.value,
      row.rate,
      (value) =>
        updateEditableSelection(row.id, (selection) => {
          selection.rate = value;
        }),
      input,
      "Inserisci un valore al m2 valido.",
    );
  }

  function handleAmountBlur(row: (typeof rows)[number], input: HTMLInputElement) {
    handleNumberBlur(
      input.value,
      row.amount,
      (value) =>
        updateEditableSelection(row.id, (selection) => {
          selection.amountOverride = Math.abs(value - row.calculatedAmount) < 0.005 ? null : value;
        }),
      input,
      "Inserisci un valore valido.",
    );
  }

  function handleLotModeChange(mode: LotValuationMode) {
    updateEditableDraft((nextDraft) => {
      nextDraft.lotValuation = { ...normalizeLotValuation(nextDraft.lotValuation), mode };
    });
  }

  function handleLotValueBlur(input: HTMLInputElement) {
    const field = lotValuation.mode === "percentage" ? "percentage" : "unitValuePerM2";
    const fallback = lotValuation[field];
    handleNumberBlur(
      input.value,
      fallback,
      (value) =>
        updateEditableDraft((nextDraft) => {
          nextDraft.lotValuation = { ...normalizeLotValuation(nextDraft.lotValuation), [field]: value };
        }),
      input,
      "Inserisci un valore lotto valido.",
    );
  }

  async function saveAreaDraft() {
    if (!draft || saving) return;
    setSaving(true);
    const nextDraft = recalculatePlanAreaDraftTotals({
      ...clonePlanAreaDraft(draft),
      savedAt: new Date().toISOString(),
    });
    try {
      window.localStorage.setItem(planAreaDraftKey(property.id), JSON.stringify(nextDraft));
    } catch {
      // Database save still proceeds when browser storage is unavailable.
    }
    try {
      const response = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(property.id)}/analysis-draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextDraft),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const savedDraft = (await response.json()) as PlanAreaDraft;
      onDraftSaved(savedDraft, "database", false);
      setEditableDraft(clonePlanAreaDraft(savedDraft));
      setDirty(false);
      onMissing("Lista aree salvata.");
    } catch (error) {
      console.error(error);
      onDraftSaved(nextDraft, "local", true);
      setEditableDraft(clonePlanAreaDraft(nextDraft));
      setDirty(false);
      onMissing("Lista aree salvata localmente; database non disponibile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop property-area-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="editor-modal property-area-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-area-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head property-area-modal-head">
          <div>
            <h2 id="property-area-modal-title">Lista aree</h2>
            <p>
              {propertyLocation(property)} - {property.categoria}
            </p>
            <div className="property-area-cadastral-reference" aria-label="Riferimenti catastali">
              <span>Foglio <strong>{property.foglio || "—"}</strong></span>
              <span>Part. <strong>{property.particella || "—"}</strong></span>
              <span>Sub. <strong>{property.subalterno || "—"}</strong></span>
            </div>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Chiudi lista aree">
            <X size={16} />
          </button>
        </div>

        <div className="property-area-detail-actions">
          <span className={`area-draft-source ${draftState.error ? "warning" : ""}`}>
            {draftState.loading ? "Caricamento bozza..." : sourceLabel}
          </span>
          <button className="button secondary compact-button" type="button" onClick={onOpenEditor}>
            <File size={14} />
            Editor
          </button>
          <button
            className="button secondary compact-button"
            type="button"
            disabled={!canOpenForMaps}
            title={canOpenForMaps ? "Apri forMaps" : "Dati catastali incompleti per forMaps"}
            onClick={onOpenForMaps}
          >
            <Building2 size={14} />
            forMaps
          </button>
          <a className="button secondary compact-button" href={googleEarthUrl(property)} target="_blank" rel="noreferrer">
            <Globe size={14} />
            Earth
          </a>
          <a className="button secondary compact-button" href={googleMapsUrl(property)} target="_blank" rel="noreferrer">
            <MapPin size={14} />
            Maps
          </a>
          <button
            className="button secondary compact-button"
            type="button"
            disabled={!propertyDocumentUrl(property, "planimetria")}
            title={
              propertyDocumentUrl(property, "planimetria")
                ? "Apri elaborato planimetrico"
                : "Elaborato planimetrico non disponibile nello storage documentale"
            }
            onClick={() => onOpenDocument("planimetria")}
          >
            <File size={14} />
            Elab. Planimetrico
          </button>
          <button
            className="button secondary compact-button"
            type="button"
            disabled={!propertyDocumentUrl(property, "visura")}
            title={
              propertyDocumentUrl(property, "visura")
                ? "Apri visura PDF"
                : "Visura PDF non disponibile nello storage documentale"
            }
            onClick={() => onOpenDocument("visura")}
          >
            <FileText size={14} />
            Visura PDF
          </button>
          <button
            className="button secondary compact-button"
            type="button"
            disabled={!propertyDocumentUrl(property, "elenco_subalterni")}
            title={
              propertyDocumentUrl(property, "elenco_subalterni")
                ? "Apri elenco subalterni PDF"
                : "Elenco subalterni PDF non disponibile nello storage documentale"
            }
            onClick={() => onOpenDocument("elenco_subalterni")}
          >
            <ClipboardList size={14} />
            Elenco subalterni
          </button>
          <button
            className="button secondary compact-button"
            type="button"
            disabled={!primaryPriceList}
            title={primaryPriceList ? `Apri ${primaryPriceList.title}` : "Nessun prezzario territoriale disponibile"}
            onClick={() => openPriceListDocument(primaryPriceList, onMissing)}
          >
            <ExternalLink size={14} />
            Prezzario
          </button>
        </div>

        {topPriceLists.length > 0 && (
          <details className="property-price-list-dropdown">
            <summary>
              <span>Prezzari rilevanti</span>
              <strong>{topPriceLists.length}</strong>
              <ChevronDown size={15} />
            </summary>
            <div className="property-price-list-menu">
              {topPriceLists.map((priceList, index) => (
                <button
                  key={priceList.id}
                  className={index === 0 ? "primary" : ""}
                  type="button"
                  title={`${priceList.reason}${priceList.distanceKm ? ` - ${Math.round(priceList.distanceKm)} km` : ""}`}
                  onClick={() => openPriceListDocument(priceList, onMissing)}
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
          </details>
        )}

        <ImuCalculationBreakdown property={property} onImuOverridesSave={onImuOverridesSave} />

        {!draft && draftState.loading ? (
          <div className="property-area-empty">
            <FileText size={22} />
            <strong>Caricamento lista aree</strong>
          </div>
        ) : !draft ? (
          <div className="property-area-empty">
            <FileText size={24} />
            <strong>Nessuna lista aree salvata</strong>
            <span>Salva una bozza dall'editor planimetrie per vedere qui superfici, valori e nuova rendita.</span>
            <button className="button primary compact-button" type="button" onClick={onOpenEditor}>
              <File size={14} />
              Apri editor planimetria
            </button>
          </div>
        ) : (
          <>
            <section className="property-lot-valuation" aria-label="Valorizzazione lotto">
              <div>
                <h3>Valorizzazione lotto</h3>
                <p>
                  Il contributo si somma al valore della destinazione d’uso solo per le righe con check Lotto.
                </p>
              </div>
              <div className="lot-mode-toggle" role="group" aria-label="Metodo di valorizzazione del lotto">
                <button
                  type="button"
                  className={lotValuation.mode === "percentage" ? "active" : ""}
                  onClick={() => handleLotModeChange("percentage")}
                >
                  Percentuale
                </button>
                <button
                  type="button"
                  className={lotValuation.mode === "per_sqm" ? "active" : ""}
                  onClick={() => handleLotModeChange("per_sqm")}
                >
                  €/m²
                </button>
              </div>
              <label className="lot-value-field">
                <span>{lotValuation.mode === "percentage" ? "Incidenza sul valore destinazioni" : "Valore unitario lotto"}</span>
                <div>
                  <input
                    key={`${lotValuation.mode}-${lotValuation.mode === "percentage" ? lotValuation.percentage : lotValuation.unitValuePerM2}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={areaFormatter.format(
                      lotValuation.mode === "percentage" ? lotValuation.percentage : lotValuation.unitValuePerM2,
                    )}
                    onBlur={(event) => handleLotValueBlur(event.currentTarget)}
                    onKeyDown={(event) =>
                      handleNumericInputKeyDown(
                        event,
                        areaFormatter.format(
                          lotValuation.mode === "percentage" ? lotValuation.percentage : lotValuation.unitValuePerM2,
                        ),
                      )
                    }
                  />
                  <strong>{lotValuation.mode === "percentage" ? "%" : "€/m²"}</strong>
                </div>
              </label>
              <small>
                {lotValuation.mode === "percentage"
                  ? "La Circolare 6/2012 indica normalmente almeno il 12% del costo delle strutture quando manca una stima di dettaglio."
                  : "Usa il valore da indagine di mercato del lotto e seleziona una sola volta le superfici fisicamente sovrapposte."}
              </small>
            </section>

            <div className="property-area-summary">
              <SummaryStat label="Aree tracciate" value={rows.length.toString()} />
              <SummaryStat label="Area totale" value={formatM2(totals.area)} />
              <SummaryStat label="Area nel lotto" value={formatM2(totals.lotArea)} />
              <SummaryStat label="Valore destinazioni" value={formatEuro(totals.baseAmount)} />
              <SummaryStat label="Valore lotto" value={formatEuro(totals.lotValue)} />
              <SummaryStat label="Valore complessivo" value={formatEuro(totals.amount)} />
              <SummaryStat label="Nuova rendita" value={formatEuro(totals.rendita)} />
              <SummaryStat label="Scala e foglio" value={`${draft.sheetSize} 1:${draft.scaleDenominator}`} />
              <SummaryStat label="Origine scala" value={planScaleSourceLabel(draft.scaleSource)} />
              <SummaryStat
                label="Scala AI"
                value={draft.aiScaleDenominator ? `${draft.aiSheetSize ?? draft.sheetSize} 1:${draft.aiScaleDenominator}` : "Non rilevata"}
              />
            </div>

            <div className="property-area-meta">
              <span>Documento: {draft.document?.fileName ?? "Nessun documento associato"}</span>
              <span>Bozza salvata: {formatDateTime(draft.savedAt)}</span>
              {draftState.error && <span>Database non raggiungibile, visualizzo la bozza locale.</span>}
            </div>

            {breakdown.length > 0 && (
              <div className="property-area-breakdown" aria-label="Ripartizione aree">
                {breakdown.map(({ usage, area }) => (
                  <span key={`${usage.id}-${usage.label}`}>
                    <i style={{ background: usage.color }} />
                    <strong>{usage.shortLabel}</strong>
                    {formatM2(area)}
                  </span>
                ))}
              </div>
            )}

            <div className="compact-table-wrap">
              <table className="compact-table property-area-table editable-property-area-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Pagina</th>
                    <th>Tipologia</th>
                    <th>Lotto</th>
                    <th>Superficie</th>
                    <th>€/m2</th>
                    <th>Valore destinazione</th>
                    <th>Quota lotto</th>
                    <th>Valore totale</th>
                    <th>Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const orphanCustomLabel =
                      row.selection.usageId === PLAN_AREA_CUSTOM_USAGE_ID &&
                      row.selection.customUsageId &&
                      !draft.customUsages?.some((customUsage) => customUsage.id === row.selection.customUsageId)
                        ? row.usage.label
                        : "";
                    return (
                      <tr key={row.id}>
                        <td>Area {row.index}</td>
                        <td>{row.page}</td>
                        <td>
                          <select
                            className="property-area-input"
                            value={planAreaUsageChoiceValue(row.selection, draft)}
                            onChange={(event) => handleUsageChange(row.id, event.target.value)}
                          >
                            <optgroup label="Predefinite">
                              {row.selection.usageId === "lotto" && (
                                <option value="fixed:lotto">Lotto (legacy — selezionare una destinazione)</option>
                              )}
                              {planAreaSelectableUsages
                                .filter((usage) => usage.id !== PLAN_AREA_CUSTOM_USAGE_ID)
                                .map((usage) => (
                                  <option key={usage.id} value={`fixed:${usage.id}`}>
                                    {usage.label}
                                  </option>
                                ))}
                            </optgroup>
                            {draft.customUsages && draft.customUsages.length > 0 && (
                              <optgroup label="Custom">
                                {draft.customUsages.map((customUsage) => (
                                  <option key={customUsage.id} value={`custom:${customUsage.id}`}>
                                    {customUsage.label}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {orphanCustomLabel && <option value={`orphan:${row.id}`}>{orphanCustomLabel}</option>}
                          </select>
                        </td>
                        <td>
                          <label className="lot-checkbox" title="Includi questa area nel calcolo del lotto">
                            <input
                              type="checkbox"
                              checked={row.selection.includedInLot === true}
                              onChange={(event) => {
                                const includedInLot = event.currentTarget.checked;
                                updateEditableSelection(row.id, (selection) => {
                                  selection.includedInLot = includedInLot;
                                });
                              }}
                              aria-label={`Includi area ${row.index} nel lotto`}
                            />
                            <span>Lotto</span>
                          </label>
                        </td>
                        <td>
                          <div className="property-area-edit-field">
                            <input
                              key={`${row.id}-area-${row.area}`}
                              type="text"
                              inputMode="decimal"
                              defaultValue={areaFormatter.format(row.area)}
                              onBlur={(event) => handleAreaBlur(row, event.currentTarget)}
                              onKeyDown={(event) => handleNumericInputKeyDown(event, areaFormatter.format(row.area))}
                            />
                            {row.areaOverridden && <span className="manual-override-badge">Manuale</span>}
                            {row.areaOverridden && (
                              <button
                                type="button"
                                className="inline-reset-button"
                                onClick={() =>
                                  updateEditableSelection(row.id, (selection) => {
                                    selection.areaOverrideM2 = null;
                                  })
                                }
                              >
                                Annulla
                              </button>
                            )}
                            {row.areaOverridden && <small>Calc. {formatM2(row.calculatedArea)}</small>}
                          </div>
                        </td>
                        <td>
                          <div className="property-area-edit-field">
                            <input
                              key={`${row.id}-rate-${row.rate}`}
                              type="text"
                              inputMode="decimal"
                              defaultValue={areaFormatter.format(row.rate)}
                              onBlur={(event) => handleRateBlur(row, event.currentTarget)}
                              onKeyDown={(event) => handleNumericInputKeyDown(event, areaFormatter.format(row.rate))}
                            />
                            <small>Euro/m2</small>
                          </div>
                        </td>
                        <td>
                          <div className="property-area-edit-field">
                            <input
                              key={`${row.id}-amount-${row.amount}`}
                              type="text"
                              inputMode="decimal"
                              defaultValue={areaFormatter.format(row.amount)}
                              onBlur={(event) => handleAmountBlur(row, event.currentTarget)}
                              onKeyDown={(event) => handleNumericInputKeyDown(event, areaFormatter.format(row.amount))}
                            />
                            {row.amountOverridden && <span className="manual-override-badge">Manuale</span>}
                            {row.amountOverridden && (
                              <button
                                type="button"
                                className="inline-reset-button"
                                onClick={() =>
                                  updateEditableSelection(row.id, (selection) => {
                                    selection.amountOverride = null;
                                  })
                                }
                              >
                                Annulla
                              </button>
                            )}
                            {row.amountOverridden && <small>Calc. {formatEuro(row.calculatedAmount)}</small>}
                          </div>
                        </td>
                        <td>
                          <strong className={row.selection.includedInLot ? "lot-value active" : "lot-value"}>
                            {row.selection.includedInLot ? formatEuro(row.lotValue) : "—"}
                          </strong>
                        </td>
                        <td><strong>{formatEuro(row.totalAmount)}</strong></td>
                        <td>{row.source}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="modal-actions property-area-modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Chiudi
          </button>
          <button className="button primary" type="button" disabled={!draft || saving || !dirty} onClick={() => void saveAreaDraft()}>
            <Save size={15} />
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </section>
    </div>
  );
}

function PropertySortHeader({
  label,
  sortKey,
  activeSort,
  direction,
  onSort,
}: {
  label: string;
  sortKey: Exclude<PropertySortKey, "manual">;
  activeSort: PropertySortKey;
  direction: "asc" | "desc";
  onSort: (sortKey: Exclude<PropertySortKey, "manual">) => void;
}) {
  const active = activeSort === sortKey;
  return (
    <th aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button className={`sort-header ${active ? "active" : ""}`} onClick={() => onSort(sortKey)}>
        {label}
        {active ? (
          direction === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        ) : (
          <ArrowDownUp size={13} />
        )}
      </button>
    </th>
  );
}

function MoneyPercentStack({
  amount,
  percent,
  favorableDirection = "up",
}: {
  amount: number | null;
  percent: number | null;
  favorableDirection?: "up" | "down";
}) {
  if (amount === null) return <span className="delta muted">Da stimare</span>;
  return (
    <div className="money-percent-stack">
      <strong>{formatEuro(amount)}</strong>
      {percent !== null && <Delta value={percent} suffix="%" favorableDirection={favorableDirection} />}
    </div>
  );
}

function ImuEstimate({ property }: { property: PropertyItem }) {
  const calculation = property.imuCalculation;
  if (property.estimatedImu === null || property.estimatedImu === undefined) {
    return <span className="delta muted">Non calcolabile</span>;
  }
  if (!calculation || calculation.status !== "calculated") return <>{formatEuro(property.estimatedImu)}</>;
  const formula = imuFormulaText(property.estimatedRendita, calculation);
  return (
    <div className="imu-estimate">
      <strong
        className="imu-estimate-value"
        title={formula}
        aria-label={`${formatEuro(property.estimatedImu)}. Formula: ${formula}`}
      >
        {formatEuro(property.estimatedImu)}
      </strong>
    </div>
  );
}

function ImuCurrent({ property }: { property: PropertyItem }) {
  const calculation = property.currentImuCalculation;
  if (property.currentImu === null || property.currentImu === undefined) {
    return <span className="delta muted">Non calcolabile</span>;
  }
  if (!calculation || calculation.status !== "calculated") return <>{formatEuro(property.currentImu)}</>;
  const formula = imuFormulaText(property.currentRendita, calculation);
  return (
    <div className="imu-estimate">
      <strong
        className="imu-estimate-value"
        title={formula}
        aria-label={`${formatEuro(property.currentImu)}. Formula: ${formula}`}
      >
        {formatEuro(property.currentImu)}
      </strong>
    </div>
  );
}

function ImuCalculationBreakdown({
  property,
  onImuOverridesSave,
}: {
  property: PropertyItem;
  onImuOverridesSave: (
    propertyId: string,
    patch: { imuRateOverride?: number | null; imuMultiplierOverride?: number | null },
  ) => Promise<PropertyImuOverrideUpdate>;
}) {
  const calculation = property.imuCalculation;
  const currentCalculation = property.currentImuCalculation;
  const currentImuSource = property.currentImuSource
    ?? (property.currentImu === null || property.currentImu === undefined ? "unavailable" : "stored");
  return (
    <section className="imu-calculation-card" aria-labelledby={`imu-calculation-${property.id}`}>
      <div className="imu-calculation-head">
        <div>
          <span>Trasparenza del calcolo</span>
          <h3 id={`imu-calculation-${property.id}`}>Calcolo IMU prevista</h3>
        </div>
        {calculation?.status === "calculated" && (
          <strong className="imu-calculation-total">{formatEuro(calculation.amount)}</strong>
        )}
      </div>

      {calculation?.status === "calculated" ? (
        <>
          <ImuFormulaSteps rendita={property.estimatedRendita} calculation={calculation} />
          <div className="imu-calculation-source">
            <div>
              <span>Aliquota applicata</span>
              <strong>
                {formatImuRate(calculation.ratePercent)} · {imuRateKindLabel(calculation.rateKind)}
                {calculation.rateOverridden && <span className="manual-override-badge">Manuale</span>}
              </strong>
              <small>
                {calculation.rateOverridden && calculation.systemRatePercent === null
                  ? "Nessuna aliquota comunale strutturata disponibile"
                  : `${calculation.municipality} (${calculation.province}) · anno ${calculation.rateYear}${calculation.usedFallback ? " · fallback perché non è disponibile il 2026" : ""}`}
              </small>
              {calculation.rateOverridden && (
                <small>
                  Predefinita dal sistema: {calculation.systemRatePercent === null
                    ? "non disponibile"
                    : formatImuRate(calculation.systemRatePercent)}
                </small>
              )}
            </div>
            <div>
              <span>Fonte</span>
              {calculation.sourceUrl ? (
                <>
                  <strong>
                    Delibera{calculation.actNumber ? ` n. ${calculation.actNumber}` : ""}
                    {calculation.actDate ? ` del ${calculation.actDate}` : ""}
                  </strong>
                  <small>
                    {calculation.publicationDate ? `Pubblicata il ${calculation.publicationDate}` : ""}
                    {calculation.cadastralCode ? ` · codice catastale ${calculation.cadastralCode}` : ""}
                  </small>
                </>
              ) : (
                <>
                  <strong>Inserimento manuale</strong>
                  <small>Nessuna aliquota comunale strutturata disponibile come riferimento.</small>
                </>
              )}
            </div>
            {calculation.sourceUrl && (
              <a href={calculation.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                Apri la delibera sorgente
              </a>
            )}
          </div>
          <p className="imu-calculation-assumption">
            Stima annuale ordinaria su quota imponibile 100%. Non applica mesi o quote di possesso, detrazioni o agevolazioni soggettive.
          </p>
        </>
      ) : (
        <div className="imu-calculation-unavailable">
          <AlertTriangle size={18} />
          <div>
            <strong>Formula automatica non disponibile</strong>
            <span>{imuUnavailableReason(calculation?.reason)}</span>
            {property.estimatedImu !== null && property.estimatedImu !== undefined && (
              <small>L’IMU prevista mostrata, {formatEuro(property.estimatedImu)}, è un dato registrato e non ricalcolato da PQ.</small>
            )}
          </div>
        </div>
      )}

      <ImuOverrideControls
        property={property}
        calculation={calculation}
        contextLabel="IMU prevista"
        onSave={onImuOverridesSave}
      />

      <div className="imu-current-source">
        <div>
          <span>IMU attuale</span>
          <strong>{property.currentImu === null || property.currentImu === undefined ? "Non disponibile" : formatEuro(property.currentImu)}</strong>
        </div>
        <p>
          {currentImuSource === "calculated"
            ? "Calcolata da PQ dalla rendita attuale con la stessa aliquota comunale e la stessa metodologia usate per l’IMU prevista."
            : currentImuSource === "stored"
              ? "Dato registrato nell’ERP o inserito manualmente: PQ non lo ha ricalcolato."
              : "Né il dato registrato né un’aliquota calcolabile sono disponibili."}
        </p>
        <ImuOverrideControls
          property={property}
          calculation={currentCalculation}
          contextLabel="IMU attuale"
          onSave={onImuOverridesSave}
          compact
        />
        {currentImuSource === "calculated" && currentCalculation?.status === "calculated" && (
          <details>
            <summary>Mostra formula IMU attuale</summary>
            <ImuFormulaSteps rendita={property.currentRendita} calculation={currentCalculation} compact />
          </details>
        )}
      </div>
    </section>
  );
}

function ImuOverrideControls({
  property,
  calculation,
  contextLabel,
  onSave,
  compact = false,
}: {
  property: PropertyItem;
  calculation: PropertyImuCalculation | null | undefined;
  contextLabel: string;
  onSave: (
    propertyId: string,
    patch: { imuRateOverride?: number | null; imuMultiplierOverride?: number | null },
  ) => Promise<PropertyImuOverrideUpdate>;
  compact?: boolean;
}) {
  const calculated = calculation?.status === "calculated" ? calculation : null;
  const [rateInput, setRateInput] = useState("");
  const [multiplierInput, setMultiplierInput] = useState("");
  const [savingField, setSavingField] = useState<"rate" | "multiplier" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const rate = property.imuRateOverride ?? calculated?.ratePercent ?? null;
    const multiplier = property.imuMultiplierOverride ?? calculated?.cadastralMultiplier ?? null;
    setRateInput(rate === null ? "" : formatImuOverrideInput(rate));
    setMultiplierInput(multiplier === null ? "" : formatImuOverrideInput(multiplier));
    setError("");
  }, [
    property.id,
    property.imuRateOverride,
    property.imuMultiplierOverride,
    calculated?.ratePercent,
    calculated?.cadastralMultiplier,
  ]);

  async function saveOverride(field: "rate" | "multiplier", value: number | null) {
    setSavingField(field);
    setError("");
    try {
      await onSave(
        property.id,
        field === "rate" ? { imuRateOverride: value } : { imuMultiplierOverride: value },
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Salvataggio override IMU non riuscito");
    } finally {
      setSavingField(null);
    }
  }

  function applyRate() {
    const parsed = parseImuOverrideInput(rateInput);
    if (parsed === null || parsed < 0 || parsed > 10) {
      setError("Inserisci un’aliquota percentuale tra 0 e 10");
      return;
    }
    void saveOverride("rate", parsed);
  }

  function applyMultiplier() {
    const parsed = parseImuOverrideInput(multiplierInput);
    if (parsed === null || parsed <= 0 || parsed > 10_000) {
      setError("Inserisci un moltiplicatore maggiore di 0 e non superiore a 10000");
      return;
    }
    void saveOverride("multiplier", parsed);
  }

  return (
    <div className={`imu-override-controls ${compact ? "compact" : ""}`} aria-label={`Override ${contextLabel}`}>
      <div className="imu-override-field">
        <div>
          <span>Aliquota IMU</span>
          {property.imuRateOverride !== null && property.imuRateOverride !== undefined && (
            <span className="manual-override-badge">Manuale</span>
          )}
        </div>
        <label>
          <input
            aria-label={`Aliquota percentuale ${contextLabel}`}
            inputMode="decimal"
            value={rateInput}
            disabled={savingField !== null}
            onChange={(event) => setRateInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyRate();
              }
            }}
          />
          <strong>%</strong>
        </label>
        <div className="imu-override-actions">
          <button type="button" disabled={savingField !== null} onClick={applyRate}>
            {savingField === "rate" ? "Salvataggio..." : "Applica"}
          </button>
          {property.imuRateOverride !== null && property.imuRateOverride !== undefined && (
            <button type="button" disabled={savingField !== null} onClick={() => void saveOverride("rate", null)}>
              Ripristina
            </button>
          )}
        </div>
        <small>
          Sistema: {calculated?.systemRatePercent === null || calculated?.systemRatePercent === undefined
            ? "non disponibile"
            : formatImuRate(calculated.systemRatePercent)}
        </small>
      </div>

      <div className="imu-override-field">
        <div>
          <span>Moltiplicatore catastale</span>
          {property.imuMultiplierOverride !== null && property.imuMultiplierOverride !== undefined && (
            <span className="manual-override-badge">Manuale</span>
          )}
        </div>
        <label>
          <input
            aria-label={`Moltiplicatore catastale ${contextLabel}`}
            inputMode="decimal"
            value={multiplierInput}
            disabled={savingField !== null}
            onChange={(event) => setMultiplierInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyMultiplier();
              }
            }}
          />
          <strong>×</strong>
        </label>
        <div className="imu-override-actions">
          <button type="button" disabled={savingField !== null} onClick={applyMultiplier}>
            {savingField === "multiplier" ? "Salvataggio..." : "Applica"}
          </button>
          {property.imuMultiplierOverride !== null && property.imuMultiplierOverride !== undefined && (
            <button type="button" disabled={savingField !== null} onClick={() => void saveOverride("multiplier", null)}>
              Ripristina
            </button>
          )}
        </div>
        <small>
          Sistema: {calculated?.systemCadastralMultiplier === null
            || calculated?.systemCadastralMultiplier === undefined
            ? "non disponibile"
            : formatImuOverrideInput(calculated.systemCadastralMultiplier)}
        </small>
      </div>
      {error && <p className="imu-override-error">{error}</p>}
    </div>
  );
}

function parseImuOverrideInput(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 10_000) / 10_000 : null;
}

function formatImuOverrideInput(value: number) {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 4, useGrouping: false });
}

function ImuFormulaSteps({
  rendita,
  calculation,
  compact = false,
}: {
  rendita: number;
  calculation: Extract<PropertyImuCalculation, { status: "calculated" }>;
  compact?: boolean;
}) {
  return (
    <div className={`imu-formula-steps ${compact ? "compact" : ""}`}>
      <div>
        <span>
          1. Base imponibile
          {calculation.cadastralMultiplierOverridden && <em className="manual-override-badge">Manuale</em>}
        </span>
        <code>
          {formatEuro(rendita)} × 1,05 × {calculation.cadastralMultiplier} = {formatEuro(calculation.taxableBase)}
        </code>
        {!compact && (
          <small>
            {calculation.cadastralMultiplierOverridden
              ? `Rendita × rivalutazione del 5% × moltiplicatore manuale; valore di sistema conservato: ${calculation.systemCadastralMultiplier ?? "non disponibile"}.`
              : "Rendita × rivalutazione del 5% × moltiplicatore della categoria catastale."}
          </small>
        )}
      </div>
      <div>
        <span>2. Imposta annua</span>
        <code>
          {formatEuro(calculation.taxableBase)} × {formatImuRate(calculation.ratePercent)} = {formatEuro(calculation.amount)}
        </code>
        {!compact && (
          <small>
            {calculation.rateOverridden
              ? `Base imponibile × aliquota manuale; valore di sistema conservato: ${calculation.systemRatePercent === null ? "non disponibile" : formatImuRate(calculation.systemRatePercent)}.`
              : "Base imponibile × aliquota comunale selezionata dalla delibera."}
          </small>
        )}
      </div>
    </div>
  );
}

function formatImuRate(value: number) {
  return `${value.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}%`;
}

function imuRateKindLabel(kind: Extract<PropertyImuCalculation, { status: "calculated" }>["rateKind"]) {
  if (kind === "group_d") return "gruppo catastale D";
  if (kind === "rural_instrumental") return "fabbricato rurale strumentale";
  return "altri fabbricati";
}

function imuUnavailableReason(reason?: Extract<PropertyImuCalculation, { status: "unavailable" }>["reason"]) {
  if (reason === "category_not_supported") return "La categoria catastale non rientra nella tabella ufficiale dei moltiplicatori IMU per i fabbricati iscritti in catasto.";
  if (reason === "municipality_not_found") return "Non è stata trovata una delibera 2026 o 2025 per comune e provincia.";
  if (reason === "unsupported_document") return "La fonte è una delibera IMI/IMIS a formato libero e richiede una regola provinciale strutturata.";
  if (reason === "rate_not_found") return "La delibera non contiene un’aliquota ordinaria compatibile con la categoria catastale.";
  return "I dati catastali necessari al calcolo sono incompleti o non validi.";
}

function imuFormulaText(rendita: number, calculation: Extract<PropertyImuCalculation, { status: "calculated" }>) {
  return `${formatEuro(rendita)} × 1,05 × ${calculation.cadastralMultiplier} = ${formatEuro(calculation.taxableBase)}; `
    + `${formatEuro(calculation.taxableBase)} × ${formatImuRate(calculation.ratePercent)} = ${formatEuro(calculation.amount)}`
    + (calculation.cadastralMultiplierOverridden
      ? `; moltiplicatore manuale, predefinito ${calculation.systemCadastralMultiplier ?? "non disponibile"}`
      : "")
    + (calculation.rateOverridden
      ? `; aliquota manuale, predefinita ${calculation.systemRatePercent === null ? "non disponibile" : formatImuRate(calculation.systemRatePercent)}`
      : "");
}

function StatusBadge({ status }: { status: StudyStatus }) {
  return <span className={`status-badge ${statusClass(status)}`}>{status}</span>;
}

function StatusSelect({
  status,
  saving,
  onChange,
}: {
  status: StudyStatus;
  saving: boolean;
  onChange: (status: StudyStatus) => void;
}) {
  return (
    <select
      className={`status-select ${statusClass(status)}`}
      value={status}
      disabled={saving}
      aria-label="Modifica stato studio di fattibilità"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        onChange(event.target.value as StudyStatus);
      }}
    >
      {editableStatusOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function OutcomeBadge({ outcome }: { outcome: PropertyOutcome }) {
  return <span className={`outcome-badge ${outcomeClass(outcome)}`}>{outcome}</span>;
}

function OutcomeSelect({
  outcome,
  onChange,
}: {
  outcome: PropertyOutcome;
  onChange: (outcome: PropertyOutcome) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);

  async function handleChange(nextOutcome: PropertyOutcome) {
    if (nextOutcome === outcome || saving) return;
    setSaving(true);
    await onChange(nextOutcome);
    setSaving(false);
  }

  return (
    <select
      className={`outcome-select ${outcomeClass(outcome)}`}
      value={outcome}
      disabled={saving}
      aria-label="Modifica esito immobile"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        void handleChange(event.target.value as PropertyOutcome);
      }}
    >
      {propertyOutcomeOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function Delta({
  value,
  suffix,
  currency,
  muted = false,
  favorableDirection = "up",
}: {
  value: number;
  suffix?: string;
  currency?: boolean;
  muted?: boolean;
  favorableDirection?: "up" | "down";
}) {
  if (muted) return <span className="delta muted">-</span>;

  const positive = favorableDirection === "down" ? value <= 0 : value >= 0;
  const label = currency ? formatEuro(value) : `${formatPercent(value).replace("%", "")}${suffix ?? ""}`;

  return <span className={`delta ${positive ? "positive" : "negative"}`}>{label}</span>;
}

function SummaryStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`summary-stat ${icon ? "with-icon" : ""}`}>
      <div className="summary-stat-label">
        {icon && <span className="summary-stat-icon">{icon}</span>}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function Owner({ owner, label }: { owner: string; label?: string }) {
  return (
    <div className="owner-cell">
      <div className="avatar small">{getInitials(owner)}</div>
      <div>
        {label && <span>{label}</span>}
        <strong>{owner}</strong>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
  delta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "purple" | "orange";
  delta: string;
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{delta}</small>
      </div>
    </div>
  );
}

function DetailMetric({
  icon,
  label,
  value,
  positive = true,
  supplementaryLabel,
  supplementaryValue,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  positive?: boolean;
  supplementaryLabel?: string;
  supplementaryValue?: string;
}) {
  return (
    <div className="detail-metric">
      <div className={positive ? "metric-symbol positive" : "metric-symbol negative"}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {supplementaryLabel && supplementaryValue && (
        <div className="metric-supplementary">
          <span>{supplementaryLabel}</span>
          <b>{supplementaryValue}</b>
        </div>
      )}
    </div>
  );
}

function ActivityItem({
  tone,
  title,
  subtitle,
  time,
}: {
  tone: "blue" | "green" | "purple" | "orange";
  title: string;
  subtitle: string;
  time: string;
}) {
  return (
    <div className="activity-item">
      <div className={`activity-icon ${tone}`}>
        {tone === "green" ? <CheckCircle2 size={17} /> : <FileText size={17} />}
      </div>
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <time>{time}</time>
    </div>
  );
}

function statusClass(status: StudyStatus) {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function outcomeClass(outcome: PropertyOutcome) {
  if (outcome === "Positivo") return "positive";
  if (outcome === "Negativo") return "negative";
  return "pending";
}

export default App;
