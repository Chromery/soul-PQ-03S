import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { DocumentType } from "../src/generated/prisma/enums.js";

type SeedProperty = {
  id: string;
  address: string;
  comune: string;
  ubicazione: string;
  foglio: string;
  particella: string;
  subalterno: string;
  categoria: string;
  titolarita: string;
  currentRendita: number;
  estimatedRendita: number;
  diffPercent: number;
  currentImu: number;
  estimatedImu: number | null;
  imuDiff: number;
  outcome: string;
  hasStudy: boolean;
  planimetria: string;
  visura: string;
  documentStorage?: Partial<Record<"planimetria" | "visura", SeedDocumentStorage>>;
};

type SeedDocumentStorage = {
  storageKey: string;
  sha256: string;
  sizeBytes: number;
};

type SeedStudy = {
  id: string;
  company: string;
  vat: string;
  comune: string;
  provincia: string;
  region: string;
  status: string;
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
  properties: SeedProperty[];
};

const demoStudies: SeedStudy[] = [
  {
    id: "S-2026-0187",
    company: "Immobiliare Aurora Srl",
    vat: "IT04719350962",
    comune: "Milano",
    provincia: "MI",
    region: "Lombardia",
    status: "Concluso",
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
    notes: "Fattibilita confermata per gli immobili produttivi. Aggiornamento documentale richiesto per due subalterni.",
    properties: [
      {
        id: "AU-01",
        address: "Via Manzoni 12",
        comune: "Milano",
        ubicazione: "Via Manzoni 12, 20121 Milano (MI)",
        foglio: "348",
        particella: "112",
        subalterno: "7",
        categoria: "D/8",
        titolarita: "Proprieta",
        currentRendita: 1248.56,
        estimatedRendita: 1842.31,
        diffPercent: 47.6,
        currentImu: 2800,
        estimatedImu: 4120,
        imuDiff: 1320,
        outcome: "Positivo",
        hasStudy: true,
        planimetria: "planimetria-au-01.pdf",
        visura: "visura-au-01.pdf",
        documentStorage: {
          planimetria: {
            storageKey: "erp/S-2026-0187/AU-01/planimetria/1c1122b6470b-planimetria-au-01.pdf",
            sha256: "1c1122b6470b135f7394eb6b115e45b5be73b913d61c7b01c1b8a167223f1a07",
            sizeBytes: 12947,
          },
          visura: {
            storageKey: "erp/S-2026-0187/AU-01/visura_catastale/18f3fd34995d-visura-au-01.pdf",
            sha256: "18f3fd34995d316660772f0aed0b36ad4252420d866d561cace1ff8e560a9f5f",
            sizeBytes: 133,
          },
        },
      },
      {
        id: "AU-02",
        address: "Via Manzoni 14",
        comune: "Milano",
        ubicazione: "Via Manzoni 14, 20121 Milano (MI)",
        foglio: "348",
        particella: "113",
        subalterno: "2",
        categoria: "D/1",
        titolarita: "Proprieta",
        currentRendita: 842.31,
        estimatedRendita: 1278.12,
        diffPercent: 51.7,
        currentImu: 2120,
        estimatedImu: 3205,
        imuDiff: 1085,
        outcome: "Positivo",
        hasStudy: true,
        planimetria: "planimetria-au-02.pdf",
        visura: "visura-au-02.pdf",
        documentStorage: {
          planimetria: {
            storageKey: "erp/S-2026-0187/AU-02/planimetria/89e7849dd002-planimetria-au-02.pdf",
            sha256: "89e7849dd0027c1f896c7626ae6e3c890eded9f7aacd6289aa2e69d4af926100",
            sizeBytes: 17840,
          },
          visura: {
            storageKey: "erp/S-2026-0187/AU-02/visura_catastale/18f3fd34995d-visura-au-02.pdf",
            sha256: "18f3fd34995d316660772f0aed0b36ad4252420d866d561cace1ff8e560a9f5f",
            sizeBytes: 133,
          },
        },
      },
      {
        id: "AU-03",
        address: "Via Verdi 8",
        comune: "Milano",
        ubicazione: "Via Giuseppe Verdi 8, 20121 Milano (MI)",
        foglio: "392",
        particella: "48",
        subalterno: "11",
        categoria: "D/7",
        titolarita: "Superficie",
        currentRendita: 1123.45,
        estimatedRendita: 1560,
        diffPercent: 38.8,
        currentImu: 3060,
        estimatedImu: 4258,
        imuDiff: 1198,
        outcome: "Positivo",
        hasStudy: true,
        planimetria: "planimetria-au-03.pdf",
        visura: "visura-au-03.pdf",
        documentStorage: {
          planimetria: {
            storageKey: "erp/S-2026-0187/AU-03/planimetria/a29f5f5a87c0-planimetria-au-03.pdf",
            sha256: "a29f5f5a87c0dca79f018f8f91749124584775dcc5015af9b3093d68ceb058bf",
            sizeBytes: 35868,
          },
          visura: {
            storageKey: "erp/S-2026-0187/AU-03/visura_catastale/18f3fd34995d-visura-au-03.pdf",
            sha256: "18f3fd34995d316660772f0aed0b36ad4252420d866d561cace1ff8e560a9f5f",
            sizeBytes: 133,
          },
        },
      },
      {
        id: "AU-04",
        address: "Via Torino 4",
        comune: "Sesto San Giovanni",
        ubicazione: "Via Torino 4, 20099 Sesto San Giovanni (MI)",
        foglio: "17",
        particella: "608",
        subalterno: "4",
        categoria: "C/3",
        titolarita: "Proprieta",
        currentRendita: 780,
        estimatedRendita: 706,
        diffPercent: -9.5,
        currentImu: 1640,
        estimatedImu: 1410,
        imuDiff: -230,
        outcome: "Negativo",
        hasStudy: true,
        planimetria: "planimetria-au-04.pdf",
        visura: "visura-au-04.pdf",
        documentStorage: {
          visura: {
            storageKey: "erp/S-2026-0187/AU-04/visura_catastale/18f3fd34995d-visura-au-04.pdf",
            sha256: "18f3fd34995d316660772f0aed0b36ad4252420d866d561cace1ff8e560a9f5f",
            sizeBytes: 133,
          },
        },
      },
    ],
  },
  {
    id: "S-2026-0186",
    company: "Logistica Padana Spa",
    vat: "IT02188470166",
    comune: "Bergamo",
    provincia: "BG",
    region: "Lombardia",
    status: "In lavorazione",
    createdAt: "2026-04-25",
    deadline: "2026-05-27",
    nextAppointment: "2026-05-28T09:30:00",
    diffRendita: 23.6,
    diffImu: 9220,
    originalRendita: 45100,
    totalRendita: 55743.6,
    catDRendita: 51200,
    commercialOwner: "Sara Villa",
    technicalOwner: "Luca Conti",
    notes: "Analisi prioritaria per appuntamento commerciale gia fissato.",
    properties: [
      {
        id: "LP-01",
        address: "Via delle Industrie 44",
        comune: "Bergamo",
        ubicazione: "Via delle Industrie 44, 24126 Bergamo (BG)",
        foglio: "61",
        particella: "902",
        subalterno: "1",
        categoria: "D/7",
        titolarita: "Proprieta",
        currentRendita: 12700,
        estimatedRendita: 15850,
        diffPercent: 24.8,
        currentImu: 12200,
        estimatedImu: 15220,
        imuDiff: 3020,
        outcome: "Positivo",
        hasStudy: true,
        planimetria: "planimetria-lp-01.pdf",
        visura: "visura-lp-01.pdf",
      },
      {
        id: "LP-02",
        address: "Via Autostrada 18",
        comune: "Dalmine",
        ubicazione: "Via Autostrada 18, 24044 Dalmine (BG)",
        foglio: "12",
        particella: "335",
        subalterno: "3",
        categoria: "D/8",
        titolarita: "Diritto di superficie",
        currentRendita: 16400,
        estimatedRendita: 0,
        diffPercent: 0,
        currentImu: 15700,
        estimatedImu: null,
        imuDiff: 0,
        outcome: "Non analizzato",
        hasStudy: false,
        planimetria: "planimetria-lp-02.pdf",
        visura: "visura-lp-02.pdf",
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
    concludedAt: "2026-05-02",
    deadline: "2026-05-29",
    diffRendita: -11.8,
    diffImu: -4320,
    originalRendita: 36620,
    totalRendita: 32298.84,
    catDRendita: 21480,
    commercialOwner: "Anna Verdi",
    technicalOwner: "Giulia Ferri",
    notes: "Studio chiuso con esito negativo. Le planimetrie disponibili non confermano incremento utile.",
    properties: [
      {
        id: "RR-01",
        address: "Via Flaminia 128",
        comune: "Rimini",
        ubicazione: "Via Flaminia 128, 47923 Rimini (RN)",
        foglio: "85",
        particella: "721",
        subalterno: "9",
        categoria: "D/8",
        titolarita: "Proprieta",
        currentRendita: 9200,
        estimatedRendita: 8080,
        diffPercent: -12.2,
        currentImu: 10900,
        estimatedImu: 9580,
        imuDiff: -1320,
        outcome: "Negativo",
        hasStudy: true,
        planimetria: "planimetria-rr-01.pdf",
        visura: "visura-rr-01.pdf",
      },
    ],
  },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function seed() {
  for (const study of demoStudies) {
    const importedStudyData = {
      company: study.company,
      vat: study.vat,
      comune: study.comune,
      provincia: study.provincia,
      region: study.region,
      createdAt: date(study.createdAt),
      concludedAt: study.concludedAt ? date(study.concludedAt) : null,
      deadline: date(study.deadline),
      nextAppointment: study.nextAppointment ? new Date(study.nextAppointment) : null,
      diffRendita: study.diffRendita,
      diffImu: study.diffImu,
      originalRendita: study.originalRendita,
      totalRendita: study.totalRendita,
      catDRendita: study.catDRendita,
      commercialOwner: study.commercialOwner,
      technicalOwner: study.technicalOwner,
      erpUrl: `https://erp.soul.local/studi/${study.id}`,
    };
    await prisma.feasibilityStudy.upsert({
      where: { id: study.id },
      create: { id: study.id, ...importedStudyData, status: study.status, notes: study.notes },
      update: importedStudyData,
    });
    await prisma.studyVersion.upsert({
      where: { studyId_versionNumber: { studyId: study.id, versionNumber: 1 } },
      create: {
        studyId: study.id,
        versionNumber: 1,
        status: study.status,
        technicalOwner: study.technicalOwner,
        notes: "Versione importata dal dataset dimostrativo ERP.",
      },
      update: {
        status: study.status,
        technicalOwner: study.technicalOwner,
      },
    });

    for (const [displayOrder, property] of study.properties.entries()) {
      const baseProperty = {
        studyId: study.id,
        address: property.address,
        comune: property.comune,
        ubicazione: property.ubicazione,
        foglio: property.foglio,
        particella: property.particella,
        subalterno: property.subalterno,
        categoria: property.categoria,
        titolarita: property.titolarita,
        currentRendita: property.currentRendita,
        estimatedRendita: property.estimatedRendita,
        diffPercent: property.diffPercent,
        currentImu: property.currentImu,
        estimatedImu: property.estimatedImu,
        imuDiff: property.imuDiff,
        outcome: property.outcome,
        hasStudy: property.hasStudy,
      };
      await prisma.property.upsert({
        where: { id: property.id },
        create: { id: property.id, displayOrder, ...baseProperty },
        update: baseProperty,
      });
      for (const document of [
        { type: DocumentType.PLANIMETRIA, kind: "planimetria" as const, fileName: property.planimetria },
        { type: DocumentType.VISURA, kind: "visura" as const, fileName: property.visura },
      ]) {
        const storage = property.documentStorage?.[document.kind];
        const storageKey = storage?.storageKey ?? `demo/${property.id.toLowerCase()}/${document.fileName}`;
        await prisma.propertyDocument.upsert({
          where: {
            propertyId_type: { propertyId: property.id, type: document.type },
          },
          create: {
            propertyId: property.id,
            type: document.type,
            fileName: document.fileName,
            storageKey,
            sha256: storage?.sha256,
            sizeBytes: storage?.sizeBytes,
          },
          update: {
            fileName: document.fileName,
            storageKey,
            sha256: storage?.sha256,
            sizeBytes: storage?.sizeBytes,
          },
        });
      }
    }
  }
  console.log(`Seed completato: ${demoStudies.length} studi dimostrativi.`);
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    await pool.end();
    process.exitCode = 1;
  });
