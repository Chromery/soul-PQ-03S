import { Injectable, NotFoundException } from "@nestjs/common";
import type { FeasibilityStudy, PriceList, Property } from "../generated/prisma/client.js";
import { DocumentStorageService } from "../erp-sync/document-storage.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type PropertyWithStudy = Property & { study: FeasibilityStudy };

@Injectable()
export class PriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
  ) {}

  async openPriceList(id: string) {
    const priceList = await this.prisma.priceList.findUnique({ where: { id } });
    if (!priceList) throw new NotFoundException("Prezzario non trovato");
    const stored = await this.storage.readObject(priceList.storageKey, priceList.mimeType);
    return {
      fileName: priceList.fileName,
      contentType: stored.contentType || priceList.mimeType || "application/octet-stream",
      contentLength: stored.contentLength ?? priceList.sizeBytes,
      stream: stored.stream,
    };
  }

  async assignForStudy(studyId: string) {
    const properties = await this.prisma.property.findMany({
      where: { studyId },
      include: { study: true },
    });
    for (const property of properties) {
      await this.assignForPropertyRecord(property);
    }
  }

  async assignForProperty(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: { study: true },
    });
    if (!property) throw new NotFoundException("Immobile non trovato");
    await this.assignForPropertyRecord(property);
  }

  private async assignForPropertyRecord(property: PropertyWithStudy) {
    const priceLists = await this.prisma.priceList.findMany();
    const ranked = rankPriceLists(property, priceLists).slice(0, 5);
    await this.prisma.$transaction([
      this.prisma.propertyPriceList.deleteMany({ where: { propertyId: property.id } }),
      ...ranked.map((match, index) =>
        this.prisma.propertyPriceList.create({
          data: {
            propertyId: property.id,
            priceListId: match.priceList.id,
            rank: index + 1,
            score: match.score,
            reason: match.reason,
            distanceKm: match.distanceKm,
          },
        }),
      ),
    ]);
  }
}

type PriceListMatch = {
  priceList: PriceList;
  score: number;
  reason: string;
  distanceKm?: number;
};

function rankPriceLists(property: PropertyWithStudy, priceLists: PriceList[]): PriceListMatch[] {
  const propertyComune = normalizeTerritory(property.comune);
  const propertyProvincia = normalizeTerritory(property.study.provincia);
  const propertyRegion = normalizeTerritory(property.study.region);
  const propertyCoords = coordinatesFor(property.comune, property.study.region);

  const matches: PriceListMatch[] = [];
  for (const priceList of priceLists) {
    const comune = normalizeTerritory(priceList.comune);
    const provincia = normalizeTerritory(priceList.provincia);
    const region = normalizeTerritory(priceList.region);
    let score = 0;
    let reason = "";
    let distanceKm: number | undefined;

    if (comune && comune === propertyComune) {
      score = 10000;
      reason = "Comune corrispondente";
    } else if (provincia && provincia === propertyProvincia) {
      score = 8000;
      reason = "Provincia corrispondente";
    } else if (region && region === propertyRegion) {
      score = 6000;
      reason = "Regione corrispondente";
    } else if (
      propertyCoords &&
      typeof priceList.latitude === "number" &&
      typeof priceList.longitude === "number"
    ) {
      distanceKm = haversineKm(propertyCoords, {
        lat: priceList.latitude,
        lon: priceList.longitude,
      });
      score = Math.max(0, 3000 - distanceKm * 12);
      reason = "Territorio piu vicino";
    }

    if (!score) continue;
    if (priceList.year) score += Math.min(80, Math.max(0, priceList.year - 1990));
    score += priceList.priority;
    matches.push({ priceList, score, reason, distanceKm });
  }

  return matches
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.distanceKm ?? Infinity) !== (b.distanceKm ?? Infinity)) {
        return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      }
      return (b.priceList.year ?? 0) - (a.priceList.year ?? 0);
    });
}

function normalizeTerritory(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function coordinatesFor(comune: string, region: string) {
  const direct = CITY_COORDS[normalizeTerritory(comune)];
  if (direct) return direct;
  return REGION_COORDS[normalizeTerritory(region)];
}

function haversineKm(a: Coordinates, b: Coordinates) {
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(value));
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

type Coordinates = { lat: number; lon: number };

const CITY_COORDS: Record<string, Coordinates> = {
  milano: { lat: 45.4642, lon: 9.19 },
  "sesto san giovanni": { lat: 45.533, lon: 9.2258 },
  pero: { lat: 45.5105, lon: 9.087 },
  bergamo: { lat: 45.6983, lon: 9.6773 },
  torino: { lat: 45.0703, lon: 7.6869 },
  treviso: { lat: 45.6669, lon: 12.243 },
  roma: { lat: 41.9028, lon: 12.4964 },
  napoli: { lat: 40.8518, lon: 14.2681 },
  bologna: { lat: 44.4949, lon: 11.3426 },
  genova: { lat: 44.4056, lon: 8.9463 },
  firenze: { lat: 43.7696, lon: 11.2558 },
  venezia: { lat: 45.4408, lon: 12.3155 },
  padova: { lat: 45.4064, lon: 11.8768 },
  verona: { lat: 45.4384, lon: 10.9916 },
};

const REGION_COORDS: Record<string, Coordinates> = {
  lombardia: { lat: 45.5856, lon: 9.9303 },
  veneto: { lat: 45.4415, lon: 11.861 },
  piemonte: { lat: 45.0522, lon: 7.5154 },
  lazio: { lat: 41.8928, lon: 12.4837 },
  "emilia romagna": { lat: 44.4949, lon: 11.3426 },
  toscana: { lat: 43.7711, lon: 11.2486 },
  marche: { lat: 43.6168, lon: 13.5189 },
  sicilia: { lat: 37.599, lon: 14.0154 },
  sardegna: { lat: 40.1209, lon: 9.0129 },
  campania: { lat: 40.8396, lon: 14.2508 },
  liguria: { lat: 44.4115, lon: 8.9327 },
  "friuli venezia giulia": { lat: 45.9457, lon: 13.1408 },
  umbria: { lat: 43.1107, lon: 12.3892 },
  abruzzo: { lat: 42.192, lon: 13.7289 },
  puglia: { lat: 41.1256, lon: 16.8667 },
  basilicata: { lat: 40.6395, lon: 15.8051 },
  calabria: { lat: 38.9059, lon: 16.5944 },
  molise: { lat: 41.5603, lon: 14.6687 },
  "trentino alto adige": { lat: 46.4983, lon: 11.3548 },
};
