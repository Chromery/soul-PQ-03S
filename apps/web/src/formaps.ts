export type ForMapsEntry = {
  provincia: string;
  comune: string;
  foglio: string | number;
  particella: string | number;
};

type PropertyLike = {
  provincia?: string | null;
  comune?: string | null;
  foglio?: string | number | null;
  particella?: string | number | null;
};

const defaultLayers = [
  { Nome: "particelle", Acceso: true, Opacita: 50 },
  { Nome: "fabbricati", Acceso: true, Opacita: 75 },
  { Nome: "numeroParticella", Acceso: true, Opacita: 100 },
  { Nome: "simboloGraffa", Acceso: true, Opacita: 100 },
];

const PROVINCE_NAMES_BY_CODE: Record<string, string> = {
  AG: "Agrigento",
  AL: "Alessandria",
  AN: "Ancona",
  AP: "Ascoli Piceno",
  AR: "Arezzo",
  BA: "Bari",
  BG: "Bergamo",
  BL: "Belluno",
  BO: "Bologna",
  BS: "Brescia",
  BZ: "Bolzano",
  CA: "Cagliari",
  CB: "Campobasso",
  CE: "Caserta",
  CL: "Caltanissetta",
  CN: "Cuneo",
  CO: "Como",
  CT: "Catania",
  FE: "Ferrara",
  FI: "Firenze",
  GE: "Genova",
  GO: "Gorizia",
  GR: "Grosseto",
  LC: "Lecco",
  LI: "Livorno",
  LO: "Lodi",
  LT: "Latina",
  LU: "Lucca",
  MC: "Macerata",
  ME: "Messina",
  MI: "Milano",
  MN: "Mantova",
  MO: "Modena",
  MS: "Massa Carrara",
  MT: "Matera",
  NA: "Napoli",
  NO: "Novara",
  PA: "Palermo",
  PD: "Padova",
  PG: "Perugia",
  PI: "Pisa",
  PN: "Pordenone",
  PO: "Prato",
  PR: "Parma",
  PT: "Pistoia",
  PU: "Pesaro e Urbino",
  PV: "Pavia",
  PZ: "Potenza",
  RC: "Reggio Calabria",
  RE: "Reggio Emilia",
  RM: "Roma",
  RO: "Rovigo",
  SI: "Siena",
  SO: "Sondrio",
  SR: "Siracusa",
  SS: "Sassari",
  SV: "Savona",
  TE: "Teramo",
  TO: "Torino",
  TR: "Terni",
  TS: "Trieste",
  TV: "Treviso",
  UD: "Udine",
  VA: "Varese",
  VE: "Venezia",
  VI: "Vicenza",
  VR: "Verona",
};

export function toForMapsEntry(property: PropertyLike): ForMapsEntry | null {
  const provincia = normalizeRequired(property.provincia);
  const comune = normalizeRequired(property.comune);
  const foglio = normalizeRequired(property.foglio);
  const particella = normalizeRequired(property.particella);
  if (!provincia || !comune || !foglio || !particella) return null;

  return {
    provincia: normalizeProvince(provincia),
    comune: comune.toLocaleUpperCase("it-IT"),
    foglio,
    particella,
  };
}

export function toForMapsEntries(properties: PropertyLike[]) {
  return properties.map(toForMapsEntry).filter((entry): entry is ForMapsEntry => Boolean(entry));
}

export function buildForMapsUrl(entry: ForMapsEntry): string {
  const lCat = encodeURIComponent(JSON.stringify(defaultLayers));
  const payload = toBase64Url({
    source: "formaps-open",
    version: 2,
    createdAt: new Date().toISOString(),
    entry: {
      provincia: entry.provincia,
      comune: entry.comune,
      foglio: String(entry.foglio),
      particella: String(entry.particella),
    },
    options: {
      openCatPanel: true,
      captureCaptcha: true,
      qwenCaptchaEndpoint: qwenCaptchaEndpoint(),
    },
  });

  return `https://www.formaps.it/Mappa?LCat=${lCat}&Experimental=False#formapsOpen=${payload}`;
}

export function openEntriesInForMaps(entries: ForMapsEntry[]): void {
  for (const entry of entries) {
    const tab = window.open(buildForMapsUrl(entry), "_blank");
    if (tab) {
      tab.opener = null;
    }
  }
}

function toBase64Url(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function qwenCaptchaEndpoint() {
  if (typeof window === "undefined") {
    return "https://soul-pq-alpha.rainailab.com/api/qwen-captcha";
  }

  return `${window.location.origin}/api/qwen-captcha`;
}

function normalizeRequired(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeProvince(value: string) {
  const code = value.trim().toLocaleUpperCase("it-IT");
  if (/^[A-Z]{2}$/.test(code)) return PROVINCE_NAMES_BY_CODE[code] ?? code;
  return value.trim();
}
