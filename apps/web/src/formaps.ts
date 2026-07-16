import { FORMAPS_PROVINCE_NAMES_BY_CODE } from "./formaps-provinces.generated";

export type ForMapsEntry = {
  provincia: string;
  comune: string;
  foglio: string | number;
  particella: string | number;
};

type PropertyLike = {
  provincia?: string | null;
  comune?: string | null;
  formapsProvincia?: string | null;
  formapsComune?: string | null;
  foglio?: string | number | null;
  particella?: string | number | null;
};

const defaultLayers = [
  { Nome: "particelle", Acceso: true, Opacita: 50 },
  { Nome: "fabbricati", Acceso: true, Opacita: 75 },
  { Nome: "numeroParticella", Acceso: true, Opacita: 100 },
  { Nome: "simboloGraffa", Acceso: true, Opacita: 100 },
];

export function toForMapsEntry(property: PropertyLike): ForMapsEntry | null {
  const provincia = normalizeRequired(property.formapsProvincia ?? property.provincia);
  const comune = normalizeRequired(property.formapsComune ?? property.comune);
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
  if (/^[A-Z]{2}$/.test(code)) return FORMAPS_PROVINCE_NAMES_BY_CODE[code] ?? code;
  return value.trim();
}
