import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  Upload,
  UserRound,
  X,
} from "lucide-react";
const PlanimetriaEditor = lazy(() => import("./PlanimetriaEditor"));
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";
const APP_DEPLOY_VERSION = import.meta.env.VITE_APP_VERSION ?? "0.44.14";

type StudyStatus = "Da iniziare" | "In lavorazione" | "In revisione" | "Concluso";

type PropertyOutcome = "Positivo" | "Negativo" | "Non analizzato";

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
  ubicazione?: string | null;
  foglio?: string | null;
  particella?: string | null;
  subalterno?: string | null;
  categoria: string;
  titolarita?: string | null;
  currentRendita: number;
  estimatedRendita: number;
  diffPercent: number;
  currentImu?: number | null;
  estimatedImu?: number | null;
  imuDiff: number;
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
  };
  documentUrls?: {
    planimetria?: string | null;
    visura?: string | null;
  };
  priceLists?: PriceListItem[];
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

type StudyUpdate = Partial<Pick<FeasibilityStudy, "status" | "notes">>;

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
  | "currentImu"
  | "estimatedImu"
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
  };
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
  opacity: number;
  totalPixels: number;
  source?: "smart" | "polygon" | "merged" | "copy";
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
      return "Studi di fattibilita";
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
      "Fattibilita confermata per gli immobili produttivi. Aggiornamento documentale richiesto per due subalterni.",
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
        outcome: "Non analizzato",
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
        outcome: "Non analizzato",
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
        outcome: "Non analizzato",
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
      "Da completare verifica categorie D/7 e D/8. Appuntamento commerciale gia fissato.",
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
        outcome: "Non analizzato",
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
        outcome: "Non analizzato",
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
        outcome: "Non analizzato",
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
        outcome: "Non analizzato",
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
        outcome: "Non analizzato",
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
      "Priorita alta per appuntamento imminente. Mancano due visure aggiornate da ERP.",
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
        outcome: "Non analizzato",
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
        outcome: "Non analizzato",
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

const PLAN_AREA_CUSTOM_USAGE_ID: PlanAreaUsageId = "custom";

const planAreaSheetSizes: Record<PlanAreaSheetSize, { widthMm: number; heightMm: number }> = {
  A3: { widthMm: 420, heightMm: 297 },
  A4: { widthMm: 297, heightMm: 210 },
};

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

type PropertyDocumentKind = "planimetria" | "visura";

function propertyDocumentUrl(property: PropertyItem, type: PropertyDocumentKind) {
  return property.documentUrls?.[type] ?? "";
}

function propertyDocumentLabel(type: PropertyDocumentKind) {
  return type === "planimetria" ? "Planimetria PDF" : "Visura PDF";
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
  if (!isObject(value.document) || typeof value.document.fileName !== "string") return false;
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

function usePlanAreaDraft(propertyId: string | null): PlanAreaDraftState {
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

  return state;
}

function propertyLocation(property: PropertyItem) {
  return property.ubicazione || `${property.address}, ${property.comune}`;
}

function deviationPercent(current: number | null | undefined, estimated: number | null | undefined) {
  if (current === null || current === undefined || estimated === null || estimated === undefined || current === 0) {
    return null;
  }
  return ((estimated - current) / current) * 100;
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

function forMapsUrl() {
  return "https://www.formaps.it/";
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
      if (property.outcome === "Non analizzato") acc.pending += 1;
      if (property.categoria.startsWith("D/")) acc.catD += 1;
      return acc;
    },
    { total: 0, performed: 0, positive: 0, negative: 0, pending: 0, catD: 0 },
  );
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
  const [presentationFiles, setPresentationFiles] = useState<Record<string, File>>({});
  const [editorDirty, setEditorDirty] = useState(false);
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

  function attachPresentation(studyId: string, file: File) {
    setPresentationFiles((current) => ({ ...current, [studyId]: file }));
    flash("Presentazione caricata per la sessione corrente.");
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
      "Titolarita",
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
      property.titolarita ?? "",
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
          presentationFile={presentationFiles[activeStudy.id]}
          onPresentationUpload={(file) => attachPresentation(activeStudy.id, file)}
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
        />
      </Shell>
    );
  }

  if (route.view === "analysis" || route.view === "report" || route.view === "settings" || route.view === "activity") {
    const sections = {
      analysis: {
        title: "Analisi",
        description: "I pannelli analitici saranno collegati ai dati consolidati degli studi.",
      },
      report: {
        title: "Report",
        description: "La generazione di report e presentazioni richiede il servizio documentale.",
      },
      settings: {
        title: "Impostazioni",
        description: "Configurazioni e permessi saranno disponibili con l'autenticazione aziendale.",
      },
      activity: {
        title: "Registro attivita",
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
        activeSection="Studi di fattibilita"
        onNavigate={navigate}
      >
        <PendingPage
          title="Elemento non trovato"
          description="Lo studio o l'immobile richiesto non e disponibile nella vista corrente."
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
              <h1>{route.view === "studies" ? "Studi di fattibilita" : "Dashboard studi di fattibilita"}</h1>
              <p>
                Monitora gli studi importati dall'ERP, le priorita commerciali e le differenze
                di rendita catastale.
              </p>
            </div>
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
                  <i className="dot pending" /> Non analizzato
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
                <section className="filters-panel in-table" aria-label="Filtri studi di fattibilita">
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
                    <th aria-label="Apri studio di fattibilita" />
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
                      onNotice={flash}
                      presentationFile={presentationFiles[study.id]}
                      onPresentationUpload={(file) => attachPresentation(study.id, file)}
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
              title={sidePanelCollapsed ? "Mostra riepilogo e attivita" : "Nascondi riepilogo e attivita"}
              aria-label={sidePanelCollapsed ? "Mostra riepilogo e attivita" : "Nascondi riepilogo e attivita"}
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
              <h2>Attivita recenti</h2>
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
              Vai al registro attivita
              <ChevronRight size={16} />
            </button>
          </section>
            </>
          )}
        </aside>
      </main>
    </Shell>
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
            active={activeSection === "Studi di fattibilita"}
            icon={<ClipboardList size={21} />}
            label="Studi di fattibilita"
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
            onClick={() => onNavigate({ view: "analysis" })}
          />
          <NavItem
            active={activeSection === "Report"}
            icon={<FileText size={21} />}
            label="Report"
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
          <div className="avatar">MG</div>
          <div>
            <strong>Marco Giordani</strong>
            <span>Commerciale</span>
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

            <button className="button primary top-action" disabled title="Disponibile dopo integrazione ERP">
              <RefreshCw size={18} />
              Sincronizza ERP
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
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={label}
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
}: {
  studies: FeasibilityStudy[];
  onOpenStudy: (study: FeasibilityStudy) => void;
  onOpenEditor: (study: FeasibilityStudy, property: PropertyItem) => void;
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
                <th>Immobile</th>
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
                  <td>{study.company}</td>
                  <td>{property.categoria}</td>
                  <td>{formatEuro(property.currentRendita)}</td>
                  <td>
                    <OutcomeBadge outcome={property.outcome} />
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
        <p>Questa sezione sara abilitata quando i servizi applicativi richiesti saranno collegati.</p>
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
  onNotice,
  presentationFile,
  onPresentationUpload,
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
  onNotice: (message: string) => void;
  presentationFile?: File;
  onPresentationUpload: (file: File) => void;
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
          <Delta value={study.diffRendita} suffix="%" />
        </td>
        <td>
          <Delta value={study.diffImu} currency />
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
            Apri studio di fattibilita
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
                      studyId={study.id}
                      file={presentationFile}
                      onUpload={onPresentationUpload}
                      onNotice={onNotice}
                    />
                    <a className="button secondary" href={study.erpUrl} target="_blank" rel="noreferrer">
                      Link allo studio sull'ERP
                      <ExternalLink size={16} />
                    </a>
                    <button className="button primary" onClick={onOpenDetail}>
                      <FileText size={16} />
                      Apri studio di fattibilita
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
                          {counts.pending} non analizzati
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
                      {property.categoria.startsWith("D/") ? <Factory size={20} /> : <Home size={20} />}
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
                            <b>{property.hasStudy ? formatPercent(property.diffPercent) : "Non disponibile"}</b>
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
                                ? "Apri planimetria PDF"
                                : "Planimetria PDF non disponibile nello storage documentale"
                            }
                            onClick={() => handleOpenDocument(property, "planimetria")}
                          >
                            <File size={13} />
                            Planimetria PDF
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
                            <th>Indirizzo</th>
                            <th>Categoria</th>
                            <th>Rendita attuale</th>
                            <th>Rendita stimata</th>
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
}: {
  property: PropertyItem;
  onOpenEditor?: () => void;
  onOpenDocument?: (type: PropertyDocumentKind) => void;
}) {
  const planimetriaUrl = propertyDocumentUrl(property, "planimetria");
  const visuraUrl = propertyDocumentUrl(property, "visura");

  return (
    <tr>
      <td>
        <div className="company-cell">
          <strong>{property.address}</strong>
          <span>{property.comune}</span>
        </div>
      </td>
      <td>{property.categoria}</td>
      <td>{formatEuro(property.currentRendita)}</td>
      <td>{property.estimatedRendita ? formatEuro(property.estimatedRendita) : "Da stimare"}</td>
      <td>
        <Delta value={property.diffPercent} suffix="%" muted={!property.hasStudy} />
      </td>
      <td>
        <OutcomeBadge outcome={property.outcome} />
      </td>
      <td>
        <div className="document-actions">
          <button onClick={onOpenEditor}>
            <File size={14} />
            Apri editor
          </button>
          <button
            disabled={!planimetriaUrl || !onOpenDocument}
            title={planimetriaUrl ? "Apri planimetria PDF" : "Planimetria PDF non disponibile nello storage documentale"}
            onClick={() => onOpenDocument?.("planimetria")}
          >
            <File size={14} />
            Planimetria PDF
          </button>
          <button
            disabled={!visuraUrl || !onOpenDocument}
            title={visuraUrl ? "Apri visura PDF" : "Visura PDF non disponibile nello storage documentale"}
            onClick={() => onOpenDocument?.("visura")}
          >
            <FileText size={14} />
            Visura PDF
          </button>
        </div>
      </td>
    </tr>
  );
}

function PresentationAction({
  studyId,
  file,
  onUpload,
  onNotice,
}: {
  studyId: string;
  file?: File;
  onUpload: (file: File) => void;
  onNotice: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);

  function generatePresentation() {
    setMenuOpen(false);
    onNotice("La generazione sara disponibile con il servizio documentale.");
  }

  function promptUpload() {
    setMenuOpen(false);
    uploadInput.current?.click();
  }

  function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    onUpload(selectedFile);
    event.target.value = "";
  }

  function downloadPresentation() {
    if (!file) {
      generatePresentation();
      return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name || `${studyId}-presentazione.pptx`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    onNotice("Download presentazione avviato.");
  }

  return (
    <div className="split-action">
      <button className="button secondary split-primary" type="button" onClick={file ? downloadPresentation : generatePresentation}>
        <Presentation size={16} />
        {file ? "Download presentazione" : "Genera presentazione"}
      </button>
      <button
        className="button secondary split-toggle"
        type="button"
        aria-label="Altre azioni presentazione"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <ChevronDown size={15} />
      </button>
      {menuOpen && (
        <div className="split-menu">
          {file && (
            <button type="button" onClick={generatePresentation}>
              <Presentation size={15} />
              Genera presentazione
            </button>
          )}
          <button type="button" onClick={promptUpload}>
            <Upload size={15} />
            Carica presentazione
          </button>
        </div>
      )}
      <input
        ref={uploadInput}
        type="file"
        accept=".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        hidden
        onChange={handleUpload}
      />
    </div>
  );
}

function StudyDetail({
  study,
  onBack,
  onExport,
  onOpenEditor,
  onNotice,
  onUpdate,
  onReorder,
  presentationFile,
  onPresentationUpload,
}: {
  study: FeasibilityStudy;
  onBack: () => void;
  onExport: () => void;
  onOpenEditor: (property: PropertyItem) => void;
  onNotice: (message: string) => void;
  onUpdate: (input: StudyUpdate) => Promise<boolean>;
  onReorder: (propertyIds: string[]) => Promise<boolean>;
  presentationFile?: File;
  onPresentationUpload: (file: File) => void;
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

  useEffect(() => {
    setSelectedPropertyIds([]);
    setPropertySortKey("manual");
    setManualOrder(study.properties.map((property) => property.id));
    setActivePropertyId(null);
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
        currentImu: [first.currentImu ?? -Infinity, second.currentImu ?? -Infinity],
        estimatedImu: [first.estimatedImu ?? -Infinity, second.estimatedImu ?? -Infinity],
        titolarita: [first.titolarita ?? "", second.titolarita ?? ""],
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
  const activeAreaDraftState = usePlanAreaDraft(activeProperty?.id ?? null);

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
    selectedProperties.forEach((property) => {
      const url =
        service === "maps"
          ? googleMapsUrl(property)
          : service === "earth"
            ? googleEarthUrl(property)
            : forMapsUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    });
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
            studyId={study.id}
            file={presentationFile}
            onUpload={onPresentationUpload}
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
          <div className="manual-order-indicator">
            <GripVertical size={15} />
            {propertySortKey === "manual" ? "Ordine manuale" : "Trascina per salvare un nuovo ordine"}
          </div>
        </div>

        <div className="property-selection-toolbar" aria-label="Azioni immobili selezionati">
          <span>
            {selectedProperties.length > 0
              ? `${selectedProperties.length} immobili selezionati`
              : "Seleziona uno o piu immobili per azioni multiple"}
          </span>
          <button
            className="button secondary compact-button"
            disabled={selectedProperties.length === 0}
            onClick={() => openSelected("formaps")}
          >
            <Building2 size={15} />
            Apri su forMaps
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
                <PropertySortHeader label="Rendita attuale" sortKey="currentRendita" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Rendita proposta" sortKey="estimatedRendita" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="IMU attuale" sortKey="currentImu" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="IMU prevista" sortKey="estimatedImu" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Foglio" sortKey="foglio" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Part." sortKey="particella" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Sub" sortKey="subalterno" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Categoria" sortKey="categoria" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Titolarita" sortKey="titolarita" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <PropertySortHeader label="Esito" sortKey="outcome" activeSort={propertySortKey} direction={propertySortDirection} onSort={handlePropertySort} />
                <th>Azioni</th>
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
                    <td>{formatEuro(property.currentRendita)}</td>
                    <td>
                      <AmountWithVariance value={formatEstimatedValue(property.estimatedRendita)} variance={property.hasStudy ? property.diffPercent : null} />
                    </td>
                    <td>{property.currentImu === null || property.currentImu === undefined ? "In attesa ERP" : formatEuro(property.currentImu)}</td>
                    <td>
                      <AmountWithVariance value={formatEstimatedValue(property.estimatedImu)} variance={imuPercent} />
                    </td>
                    <td>{property.foglio || "In attesa ERP"}</td>
                    <td>{property.particella || "In attesa ERP"}</td>
                    <td>{property.subalterno || "In attesa ERP"}</td>
                    <td>{property.categoria}</td>
                    <td>{property.titolarita || "In attesa ERP"}</td>
                    <td>
                      <OutcomeBadge outcome={property.outcome} />
                    </td>
                    <td>
                      <div className="property-external-actions">
                        <button
                          type="button"
                          className={activePropertyId === property.id ? "active" : ""}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActivePropertyId(property.id);
                          }}
                        >
                          <FileText size={14} />
                          Dettaglio
                        </button>
                        <a
                          href={forMapsUrl()}
                          target="_blank"
                          rel="noreferrer"
                          title="Apri forMaps"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Building2 size={14} />
                          forMaps
                        </a>
                        <a href={googleEarthUrl(property)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                          <Globe size={14} />
                          Earth
                        </a>
                        <a href={googleMapsUrl(property)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                          <MapPin size={14} />
                          Maps
                        </a>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenEditor(property);
                          }}
                        >
                          <File size={14} />
                          Editor
                        </button>
                        <button
                          type="button"
                          disabled={!propertyDocumentUrl(property, "planimetria")}
                          title={
                            propertyDocumentUrl(property, "planimetria")
                              ? "Apri planimetria PDF"
                              : "Planimetria PDF non disponibile nello storage documentale"
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenDocument(property, "planimetria");
                          }}
                        >
                          <File size={14} />
                          Planimetria PDF
                        </button>
                        <button
                          type="button"
                          disabled={!propertyDocumentUrl(property, "visura")}
                          title={
                            propertyDocumentUrl(property, "visura")
                              ? "Apri visura PDF"
                              : "Visura PDF non disponibile nello storage documentale"
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenDocument(property, "visura");
                          }}
                        >
                          <FileText size={14} />
                          Visura PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {activeProperty && (
          <PropertyAreaDetail
            property={activeProperty}
            draftState={activeAreaDraftState}
            onOpenEditor={() => onOpenEditor(activeProperty)}
            onOpenDocument={(type) => handleOpenDocument(activeProperty, type)}
            onMissing={onNotice}
            onClose={() => setActivePropertyId(null)}
          />
        )}
      </section>

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
          positive={study.diffRendita >= 0}
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
            <SummaryStat label="Non analizzati" value={counts.pending.toString()} />
          </div>
        </div>

        <div className="detail-card">
          <div className="section-title">
            <h2>Dati responsabilita</h2>
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
  onOpenEditor,
  onOpenDocument,
  onMissing,
  onClose,
}: {
  property: PropertyItem;
  draftState: PlanAreaDraftState;
  onOpenEditor: () => void;
  onOpenDocument: (type: PropertyDocumentKind) => void;
  onMissing: (message: string) => void;
  onClose: () => void;
}) {
  const draft = draftState.draft;
  const rows = useMemo(() => {
    if (!draft) return [];
    return draft.selections.map((selection, index) => {
      const usage = planAreaUsageForSelection(selection);
      const rate = selection.rate ?? usage.rate;
      const area = planAreaFromPixels(selection, draft);
      return {
        id: selection.id,
        index: index + 1,
        page: selection.page,
        usage,
        rate,
        area,
        amount: area * rate,
        pixels: selection.region.count,
        opacity: Math.round(selection.opacity * 100),
        source: planAreaSourceLabel(selection.source),
      };
    });
  }, [draft]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.area += row.area;
          acc.amount += row.amount;
          return acc;
        },
        { area: 0, amount: 0 },
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

  return (
    <section className="property-area-detail" aria-label={`Lista aree ${property.address}`}>
      <div className="section-title property-area-detail-title">
        <div>
          <h2>Lista aree</h2>
          <span>
            {propertyLocation(property)} - {property.categoria}
          </span>
        </div>
        <div className="property-area-detail-actions">
          <span className={`area-draft-source ${draftState.error ? "warning" : ""}`}>
            {draftState.loading ? "Caricamento bozza..." : sourceLabel}
          </span>
          <button className="button secondary compact-button" type="button" onClick={onOpenEditor}>
            <File size={14} />
            Apri editor
          </button>
          <button
            className="button secondary compact-button"
            type="button"
            disabled={!propertyDocumentUrl(property, "planimetria")}
            title={
              propertyDocumentUrl(property, "planimetria")
                ? "Apri planimetria PDF"
                : "Planimetria PDF non disponibile nello storage documentale"
            }
            onClick={() => onOpenDocument("planimetria")}
          >
            <File size={14} />
            Planimetria PDF
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
            disabled={!primaryPriceList}
            title={
              primaryPriceList
                ? `Apri ${primaryPriceList.title}`
                : "Nessun prezzario territoriale disponibile"
            }
            onClick={() => openPriceListDocument(primaryPriceList, onMissing)}
          >
            <ExternalLink size={14} />
            Prezzario
          </button>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Chiudi dettaglio immobile">
            <X size={16} />
          </button>
        </div>
      </div>
      {topPriceLists.length > 0 && (
        <section className="property-price-list-panel" aria-label="Prezzari rilevanti">
          <div className="property-price-list-header">
            <strong>Prezzari rilevanti</strong>
          </div>
          <div className="property-price-list-list">
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
        </section>
      )}

      {!draft && draftState.loading ? (
        <div className="property-area-empty">
          <FileText size={22} />
          <strong>Caricamento lista aree</strong>
        </div>
      ) : !draft ? (
        <div className="property-area-empty">
          <FileText size={24} />
          <strong>Nessuna lista aree salvata</strong>
          <span>Salva una bozza dall'editor planimetrie per vedere qui superfici, valori e stime.</span>
          <button className="button primary compact-button" type="button" onClick={onOpenEditor}>
            <File size={14} />
            Apri editor planimetria
          </button>
        </div>
      ) : (
        <>
          <div className="property-area-summary">
            <SummaryStat label="Aree tracciate" value={rows.length.toString()} />
            <SummaryStat label="Area totale" value={formatM2(totals.area)} />
            <SummaryStat label="Stima prototipo" value={formatEuro(totals.amount)} />
            <SummaryStat label="Scala e foglio" value={`${draft.sheetSize} 1:${draft.scaleDenominator}`} />
            <SummaryStat label="Origine scala" value={planScaleSourceLabel(draft.scaleSource)} />
            <SummaryStat
              label="Scala AI"
              value={draft.aiScaleDenominator ? `${draft.aiSheetSize ?? draft.sheetSize} 1:${draft.aiScaleDenominator}` : "Non rilevata"}
            />
          </div>

          <div className="property-area-meta">
            <span>Documento: {draft.document.fileName}</span>
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
            <table className="compact-table property-area-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Pagina</th>
                  <th>Tipologia</th>
                  <th>Superficie</th>
                  <th>Valore</th>
                  <th>Stima</th>
                  <th>Pixel</th>
                  <th>Opacita</th>
                  <th>Origine</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>Area {row.index}</td>
                    <td>{row.page}</td>
                    <td>
                      <span className="area-usage-cell">
                        <i style={{ background: row.usage.color }} />
                        {row.usage.label}
                      </span>
                    </td>
                    <td>{formatM2(row.area)}</td>
                    <td>{areaFormatter.format(row.rate)} Euro/m2</td>
                    <td>{formatEuro(row.amount)}</td>
                    <td>{row.pixels.toLocaleString("it-IT")}</td>
                    <td>{row.opacity}%</td>
                    <td>{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
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

function AmountWithVariance({
  value,
  variance,
}: {
  value: string;
  variance: number | null;
}) {
  return (
    <div className="amount-variance">
      <strong>{value}</strong>
      {variance !== null && <Delta value={variance} suffix="%" />}
    </div>
  );
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
      aria-label="Modifica stato studio di fattibilita"
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

function Delta({
  value,
  suffix,
  currency,
  muted = false,
}: {
  value: number;
  suffix?: string;
  currency?: boolean;
  muted?: boolean;
}) {
  if (muted) return <span className="delta muted">-</span>;

  const positive = value >= 0;
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
