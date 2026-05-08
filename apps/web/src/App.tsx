import { useMemo, useState } from "react";
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
  Home,
  LayoutDashboard,
  MoreVertical,
  Presentation,
  RefreshCw,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import PlanimetriaEditor from "./PlanimetriaEditor";

type StudyStatus =
  | "Favorevole"
  | "Non favorevole"
  | "Da valutare"
  | "In lavorazione"
  | "Con appuntamento"
  | "In revisione";

type PropertyOutcome = "Positivo" | "Negativo" | "Non analizzato";

type PropertyItem = {
  id: string;
  address: string;
  comune: string;
  categoria: string;
  currentRendita: number;
  estimatedRendita: number;
  diffPercent: number;
  imuDiff: number;
  outcome: PropertyOutcome;
  hasStudy: boolean;
  documents: {
    planimetria: string;
    visura: string;
  };
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

type SortKey =
  | "createdAt"
  | "concludedAt"
  | "deadline"
  | "nextAppointment"
  | "diffRendita"
  | "diffImu"
  | "appointment"
  | "originalRendita"
  | "propertiesCount"
  | "commercialOwner"
  | "technicalOwner";

const studies: FeasibilityStudy[] = [
  {
    id: "S-2026-0187",
    company: "Immobiliare Aurora Srl",
    vat: "IT04719350962",
    comune: "Milano",
    provincia: "MI",
    region: "Lombardia",
    status: "Favorevole",
    createdAt: "2026-04-29",
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
    status: "Da valutare",
    createdAt: "2026-04-27",
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
    status: "Con appuntamento",
    createdAt: "2026-04-23",
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
    status: "Non favorevole",
    createdAt: "2026-04-18",
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
  { value: "createdAt", label: "Data creazione" },
  { value: "concludedAt", label: "Data esito" },
  { value: "deadline", label: "Data scadenza" },
  { value: "nextAppointment", label: "Prossimo appuntamento" },
  { value: "diffRendita", label: "Differenza rendita" },
  { value: "diffImu", label: "Differenza IMU" },
  { value: "appointment", label: "Con appuntamento" },
  { value: "originalRendita", label: "Rendita originale totale" },
  { value: "propertiesCount", label: "Numero immobili" },
  { value: "commercialOwner", label: "Commerciale" },
  { value: "technicalOwner", label: "Responsabile tecnico" },
];

const statusOptions: Array<StudyStatus | "Tutti"> = [
  "Tutti",
  "Favorevole",
  "Non favorevole",
  "Da valutare",
  "In lavorazione",
  "Con appuntamento",
  "In revisione",
];

const regions = ["Tutte", ...Array.from(new Set(studies.map((study) => study.region)))];

const euroFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

const numberFormatter = new Intl.NumberFormat("it-IT");

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

function getInitials(name: string) {
  return name
    .split(" ")
    .map((chunk) => chunk[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function isPositiveStatus(status: StudyStatus) {
  return status === "Favorevole";
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
    case "createdAt":
      return new Date(study.createdAt).getTime();
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
    case "propertiesCount":
      return study.properties.length;
    case "commercialOwner":
      return study.commercialOwner;
    case "technicalOwner":
      return study.technicalOwner;
  }
}

function App() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<StudyStatus | "Tutti">("Tutti");
  const [regionFilter, setRegionFilter] = useState("Tutte");
  const [appointmentOnly, setAppointmentOnly] = useState(false);
  const [expandedStudy, setExpandedStudy] = useState(studies[0].id);
  const [activeStudyId, setActiveStudyId] = useState<string | null>(null);
  const [editorContext, setEditorContext] = useState<{ studyId: string; propertyId: string } | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const studyId = params.get("editorStudy");
    const propertyId = params.get("editorProperty");
    return studyId && propertyId ? { studyId, propertyId } : null;
  });
  const [toast, setToast] = useState("");

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
  }, [appointmentOnly, query, regionFilter, sortDirection, sortKey, statusFilter]);

  const activeStudy = activeStudyId
    ? studies.find((study) => study.id === activeStudyId)
    : undefined;
  const editorStudy = editorContext
    ? studies.find((study) => study.id === editorContext.studyId)
    : undefined;
  const editorProperty = editorStudy?.properties.find(
    (property) => property.id === editorContext?.propertyId,
  );

  const totals = useMemo(() => {
    const visible = filteredStudies.length ? filteredStudies : studies;
    const active = visible.filter((study) => study.status !== "Non favorevole").length;
    const positive = visible.filter((study) => isPositiveStatus(study.status)).length;
    const potentialRendita = visible.reduce((sum, study) => sum + study.totalRendita, 0);
    const averageDiff =
      visible.reduce((sum, study) => sum + study.diffRendita, 0) / Math.max(visible.length, 1);
    return {
      active,
      positive,
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

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function downloadFilteredExcel() {
    const headers = [
      "ID studio",
      "Azienda",
      "P. IVA",
      "Comune",
      "Stato",
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

    const rows = filteredStudies.map((study) => [
      study.id,
      study.company,
      study.vat,
      `${study.comune} (${study.provincia})`,
      study.status,
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
    link.download = "studi-fattibilita-filtrati.csv";
    link.click();
    URL.revokeObjectURL(url);
    flash("Lista filtrata esportata per Excel.");
  }

  function openErp(study = filteredStudies[0]) {
    if (!study) {
      flash("Nessuno studio disponibile con i filtri correnti.");
      return;
    }
    window.open(study.erpUrl, "_blank", "noopener,noreferrer");
  }

  function resetFilters() {
    setQuery("");
    setStatusFilter("Tutti");
    setRegionFilter("Tutte");
    setAppointmentOnly(false);
  }

  if (editorStudy && editorProperty) {
    return (
      <Shell query={query} setQuery={setQuery} toast={toast} activeSection="Immobili">
        <PlanimetriaEditor
          study={editorStudy}
          property={editorProperty}
          onBack={() => setEditorContext(null)}
        />
      </Shell>
    );
  }

  if (activeStudy) {
    return (
      <Shell
        query={query}
        setQuery={setQuery}
        toast={toast}
        activeSection="Studi di fattibilita"
      >
        <StudyDetail
          study={activeStudy}
          onBack={() => setActiveStudyId(null)}
          onOpenErp={() => openErp(activeStudy)}
          onExport={() => {
            setActiveStudyId(null);
            window.setTimeout(downloadFilteredExcel, 0);
          }}
          onOpenEditor={(property) =>
            setEditorContext({ studyId: activeStudy.id, propertyId: property.id })
          }
        />
      </Shell>
    );
  }

  return (
    <Shell query={query} setQuery={setQuery} toast={toast} activeSection="Dashboard">
      <main className="dashboard-grid">
        <section className="workspace">
          <div className="page-heading">
            <div>
              <p className="eyebrow">Import ERP</p>
              <h1>Dashboard studi di fattibilita</h1>
              <p>
                Monitora gli studi importati dall'ERP, le priorita commerciali e le differenze
                di rendita catastale.
              </p>
            </div>
            <button className="button primary" onClick={() => flash("Sincronizzazione ERP avviata.")}>
              <RefreshCw size={18} />
              Sincronizza ERP
            </button>
          </div>

          <section className="filters-panel" aria-label="Filtri studi di fattibilita">
            <div className="filters-summary">
              <div className="filters-title">
                <SlidersHorizontal size={18} />
                <span>Filtri attivi ({activeFilterCount})</span>
              </div>
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
                    Con appuntamento
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
                  <span className="muted-chip">Nessun filtro, ultimi studi importati</span>
                )}
              </div>
              <button className="icon-button" title="Reimposta filtri" onClick={resetFilters}>
                <RefreshCw size={17} />
              </button>
            </div>

            <div className="filter-controls">
              <label className="search-field table-search">
                <Search size={17} />
                <input
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
                <span>Con appuntamento</span>
              </label>
            </div>
          </section>

          <div className="toolbar">
            <button
              className="button primary"
              onClick={() => flash(`${filteredStudies.length} studi pronti per l'invio a ERP.`)}
            >
              <Send size={17} />
              Invia a ERP
            </button>
            <button className="button secondary" onClick={() => flash("Preparazione PPTX in coda.")}>
              <Presentation size={17} />
              Download presentazione
            </button>
            <button className="button secondary" onClick={() => openErp()}>
              <ExternalLink size={17} />
              Link allo studio sull'ERP
            </button>
            <button className="button secondary" onClick={downloadFilteredExcel}>
              <FileSpreadsheet size={17} />
              Scarica lista Excel
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
                  <i className="dot pending" /> Non analizzato
                </span>
              </div>
            </div>

            <div className="studies-table-wrap">
              <table className="studies-table">
                <thead>
                  <tr>
                    <th aria-label="Espandi studio" />
                    <SortableHeader
                      label="ID studio"
                      sortKey="createdAt"
                      activeSort={sortKey}
                      onSort={setSortKey}
                    />
                    <th>Azienda</th>
                    <SortableHeader
                      label="N. immobili"
                      sortKey="propertiesCount"
                      activeSort={sortKey}
                      onSort={setSortKey}
                    />
                    <th>Stato</th>
                    <SortableHeader
                      label="Scadenza"
                      sortKey="deadline"
                      activeSort={sortKey}
                      onSort={setSortKey}
                    />
                    <SortableHeader
                      label="Diff. rendita"
                      sortKey="diffRendita"
                      activeSort={sortKey}
                      onSort={setSortKey}
                    />
                    <SortableHeader
                      label="Diff. IMU"
                      sortKey="diffImu"
                      activeSort={sortKey}
                      onSort={setSortKey}
                    />
                    <SortableHeader
                      label="Rendita totale"
                      sortKey="originalRendita"
                      activeSort={sortKey}
                      onSort={setSortKey}
                    />
                    <SortableHeader
                      label="Commerciale"
                      sortKey="commercialOwner"
                      activeSort={sortKey}
                      onSort={setSortKey}
                    />
                    <th aria-label="Azioni" />
                  </tr>
                </thead>
                <tbody>
                  {filteredStudies.map((study) => (
                    <StudyRows
                      key={study.id}
                      study={study}
                      expanded={expandedStudy === study.id}
                      onToggle={() =>
                        setExpandedStudy((current) => (current === study.id ? "" : study.id))
                      }
                      onOpenDetail={() => setActiveStudyId(study.id)}
                      onOpenErp={() => openErp(study)}
                      onOpenEditor={(property) =>
                        setEditorContext({ studyId: study.id, propertyId: property.id })
                      }
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

        <aside className="side-panel">
          <section className="summary-card">
            <h2>Riepilogo</h2>
            <MetricCard
              icon={<FileText size={24} />}
              label="Studi attivi"
              value={numberFormatter.format(totals.active)}
              tone="blue"
              delta="+12% vs periodo precedente"
            />
            <MetricCard
              icon={<CheckCircle2 size={24} />}
              label="Con esito positivo"
              value={numberFormatter.format(totals.positive)}
              tone="green"
              delta="+8% vs periodo precedente"
            />
            <MetricCard
              icon={<BarChart3 size={24} />}
              label="Diff. rendita media"
              value={formatPercent(totals.averageDiff)}
              tone="purple"
              delta="+3,4 pp vs mese precedente"
            />
            <MetricCard
              icon={<Euro size={24} />}
              label="Rendita potenziale totale"
              value={formatEuro(totals.potentialRendita)}
              tone="orange"
              delta="+10,7% vs periodo precedente"
            />
          </section>

          <section className="activity-card">
            <div className="activity-header">
              <h2>Attivita recenti</h2>
              <button>Vedi tutto</button>
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
            <button className="button soft full-width">
              Vai al registro attivita
              <ChevronRight size={16} />
            </button>
          </section>
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
}: {
  children: React.ReactNode;
  query: string;
  setQuery: (query: string) => void;
  toast: string;
  activeSection: string;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/soul_logo_blu.png" alt="Soul Prospect Qualifier" />
        </div>
        <nav className="nav-menu" aria-label="Navigazione principale">
          <NavItem active={activeSection === "Dashboard"} icon={<LayoutDashboard size={21} />} label="Dashboard" />
          <NavItem
            active={activeSection === "Studi di fattibilita"}
            icon={<ClipboardList size={21} />}
            label="Studi di fattibilita"
          />
          <NavItem active={activeSection === "Immobili"} icon={<Building2 size={21} />} label="Immobili" />
          <NavItem icon={<BarChart3 size={21} />} label="Analisi" />
          <NavItem icon={<FileText size={21} />} label="Report" />
          <NavItem icon={<Settings size={21} />} label="Impostazioni" />
        </nav>

        <div className="operator-card">
          <div className="avatar">MG</div>
          <div>
            <strong>Marco Giordani</strong>
            <span>Commerciale</span>
          </div>
          <ChevronDown size={17} />
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <label className="search-field global-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca aziende, immobili, studi..."
            />
            <kbd>Ctrl K</kbd>
          </label>

          <button className="date-picker">
            <CalendarDays size={18} />
            01 Mag 2026 - 31 Mag 2026
            <ChevronDown size={15} />
          </button>

          <button className="button primary top-action">
            <UploadCloud size={18} />
            Importa ERP
          </button>

          <div className="top-icons">
            <button className="icon-button notification" title="Notifiche">
              <Bell size={19} />
              <span>8</span>
            </button>
            <button className="icon-button" title="Aiuto">
              <CircleHelp size={19} />
            </button>
            <button className="icon-button" title="Impostazioni vista">
              <SlidersHorizontal size={19} />
            </button>
            <button className="icon-button" title="Altre azioni">
              <MoreVertical size={19} />
            </button>
          </div>
        </header>
        {children}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function NavItem({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSort: SortKey;
  onSort: (sortKey: SortKey) => void;
}) {
  return (
    <th>
      <button className={`sort-header ${activeSort === sortKey ? "active" : ""}`} onClick={() => onSort(sortKey)}>
        {label}
        <ArrowDownUp size={13} />
      </button>
    </th>
  );
}

function StudyRows({
  study,
  expanded,
  onToggle,
  onOpenDetail,
  onOpenErp,
  onOpenEditor,
}: {
  study: FeasibilityStudy;
  expanded: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
  onOpenErp: () => void;
  onOpenEditor: (property: PropertyItem) => void;
}) {
  const counts = getCounts(study);

  return (
    <>
      <tr className={`study-row ${expanded ? "expanded" : ""}`}>
        <td>
          <button className="expand-button" aria-expanded={expanded} onClick={onToggle}>
            {expanded ? <ChevronUp size={17} /> : <ChevronRight size={17} />}
          </button>
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
          <StatusBadge status={study.status} />
        </td>
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
        <td>
          <button className="icon-button" title="Apri su ERP" onClick={onOpenErp}>
            <ExternalLink size={17} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="study-detail-row">
          <td colSpan={11}>
            <div className="expanded-panel">
              <section className="property-overview">
                <div className="section-title">
                  <h3>Panoramica immobili</h3>
                  <span>
                    {counts.performed}/{counts.total} studi eseguiti
                  </span>
                </div>
                <div className="property-icons" aria-label="Esiti degli immobili">
                  {study.properties.map((property) => (
                    <div
                      key={property.id}
                      className={`property-tile ${outcomeClass(property.outcome)}`}
                      title={`${property.address}, ${property.comune} - ${property.outcome}`}
                    >
                      {property.categoria.startsWith("D/") ? <Factory size={20} /> : <Home size={20} />}
                    </div>
                  ))}
                </div>
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
              </section>

              <section className="study-summary">
                <div className="section-title">
                  <h3>Riepilogo studio</h3>
                  <StatusBadge status={study.status} />
                </div>
                <div className="summary-grid">
                  <SummaryStat label="N. immobili" value={counts.total.toString()} />
                  <SummaryStat label="In categoria D" value={counts.catD.toString()} />
                  <SummaryStat label="Rendita totale" value={formatEuro(study.totalRendita)} />
                  <SummaryStat label="Rendita categoria D" value={formatEuro(study.catDRendita)} />
                  <SummaryStat label="Data creazione" value={formatDate(study.createdAt)} />
                  <SummaryStat label="Data esito" value={formatDate(study.concludedAt)} />
                  <SummaryStat label="Commerciale" value={study.commercialOwner} />
                  <SummaryStat label="Responsabile tecnico" value={study.technicalOwner} />
                </div>
                <div className="notes-block">
                  <span>Note</span>
                  <p>{study.notes}</p>
                </div>
                <div className="summary-actions">
                  <button className="button secondary" onClick={onOpenErp}>
                    Link ERP
                    <ExternalLink size={16} />
                  </button>
                  <button className="button primary" onClick={onOpenDetail}>
                    Apri studio di fattibilita
                    <ExternalLink size={16} />
                  </button>
                </div>
              </section>

              <section className="property-table-section">
                <div className="section-title">
                  <h3>Dettaglio immobili ({counts.total})</h3>
                  <span>Planimetrie e visure catastali da S3</span>
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
                      {study.properties.slice(0, 6).map((property) => (
                        <PropertyRow
                          key={property.id}
                          property={property}
                          onOpenEditor={() => onOpenEditor(property)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
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
}: {
  property: PropertyItem;
  onOpenEditor?: () => void;
}) {
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
          <button>
            <FileText size={14} />
            Visura PDF
          </button>
        </div>
      </td>
    </tr>
  );
}

function StudyDetail({
  study,
  onBack,
  onOpenErp,
  onExport,
  onOpenEditor,
}: {
  study: FeasibilityStudy;
  onBack: () => void;
  onOpenErp: () => void;
  onExport: () => void;
  onOpenEditor: (property: PropertyItem) => void;
}) {
  const counts = getCounts(study);
  const positiveShare = Math.round((counts.positive / Math.max(counts.total, 1)) * 100);

  return (
    <main className="detail-page">
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={17} />
        Torna alla dashboard
      </button>

      <section className="detail-hero">
        <div>
          <div className="detail-meta">
            <span>{study.id}</span>
            <StatusBadge status={study.status} />
          </div>
          <h1>{study.company}</h1>
          <p>
            {study.comune} ({study.provincia}) - {study.vat}
          </p>
        </div>
        <div className="detail-actions">
          <button className="button secondary" onClick={onExport}>
            <FileSpreadsheet size={17} />
            Esporta Excel
          </button>
          <button className="button secondary" onClick={onOpenErp}>
            <ExternalLink size={17} />
            Link ERP
          </button>
          <button className="button primary">
            <Send size={17} />
            Invia a ERP
          </button>
        </div>
      </section>

      <section className="detail-metrics">
        <DetailMetric icon={<Building2 size={22} />} label="Immobili" value={counts.total.toString()} />
        <DetailMetric icon={<Factory size={22} />} label="In categoria D" value={counts.catD.toString()} />
        <DetailMetric
          icon={<CircleDollarSign size={22} />}
          label="Rendita totale"
          value={formatEuro(study.totalRendita)}
        />
        <DetailMetric
          icon={study.diffRendita >= 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
          label="Differenza rendita"
          value={formatPercent(study.diffRendita)}
          positive={study.diffRendita >= 0}
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

      <section className="detail-card property-detail-card">
        <div className="section-title">
          <h2>Immobili dello studio</h2>
          <span>{counts.catD} in categoria D</span>
        </div>
        <div className="compact-table-wrap">
          <table className="compact-table">
            <thead>
              <tr>
                <th>Immobile</th>
                <th>Comune</th>
                <th>Categoria</th>
                <th>Rendita attuale</th>
                <th>Rendita prospettata</th>
                <th>Diff. IMU</th>
                <th>Esito</th>
                <th>Documenti</th>
              </tr>
            </thead>
            <tbody>
              {study.properties.map((property) => (
                <tr key={property.id}>
                  <td>{property.address}</td>
                  <td>{property.comune}</td>
                  <td>{property.categoria}</td>
                  <td>{formatEuro(property.currentRendita)}</td>
                  <td>{property.estimatedRendita ? formatEuro(property.estimatedRendita) : "Da stimare"}</td>
                  <td>
                    <Delta value={property.imuDiff} currency muted={!property.hasStudy} />
                  </td>
                  <td>
                    <OutcomeBadge outcome={property.outcome} />
                  </td>
                  <td>
                    <div className="document-actions">
                      <button onClick={() => onOpenEditor(property)}>
                        <File size={14} />
                        Editor planimetria
                      </button>
                      <button>
                        <FileText size={14} />
                        Visura
                      </button>
                    </div>
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

function StatusBadge({ status }: { status: StudyStatus }) {
  return <span className={`status-badge ${statusClass(status)}`}>{status}</span>;
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

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-stat">
      <span>{label}</span>
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="detail-metric">
      <div className={positive ? "metric-symbol positive" : "metric-symbol negative"}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
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
  return status
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace("non-favorevole", "negativo");
}

function outcomeClass(outcome: PropertyOutcome) {
  if (outcome === "Positivo") return "positive";
  if (outcome === "Negativo") return "negative";
  return "pending";
}

export default App;
