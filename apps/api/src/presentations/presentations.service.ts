import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Browser } from "playwright-core";
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StudiesService } from "../studies/studies.service.js";
import type {
  PresentationSnapshot,
  PresentationSummary,
} from "./presentations.types.js";

const TEMPLATE_URL = new URL("./templates/soul-deck.html", import.meta.url);
const ASSET_URLS = {
  __ASSET_LOGO__: { url: new URL("./templates/assets/soul-logo.svg", import.meta.url), contentType: "image/svg+xml" },
  __ASSET_COVER__: { url: new URL("./templates/assets/soul-exterior-mountain-facade.jpg", import.meta.url), contentType: "image/jpeg" },
  __ASSET_RECEPTION__: { url: new URL("./templates/assets/soul-reception.png", import.meta.url), contentType: "image/png" },
  __ASSET_ATRIUM__: { url: new URL("./templates/assets/soul-atrium-lounge-wide.jpg", import.meta.url), contentType: "image/jpeg" },
  __ASSET_WORKSPACE__: { url: new URL("./templates/assets/soul-workspace-table-detail.jpg", import.meta.url), contentType: "image/jpeg" },
  __ASSET_HANDSHAKE__: { url: new URL("./templates/assets/soul-handshake.png", import.meta.url), contentType: "image/png" },
} as const;

@Injectable()
export class PresentationsService implements OnModuleDestroy {
  private templatePromise?: Promise<string>;
  private browserPromise?: Promise<Browser>;
  private readonly pdfCache = new Map<string, Buffer>();
  private readonly chromiumExecutablePath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly studies: StudiesService,
    config: ConfigService,
  ) {
    this.chromiumExecutablePath = config.get<string>("CHROMIUM_EXECUTABLE_PATH", "/usr/bin/chromium");
  }

  async create(studyId: string, propertyIds: string[]) {
    const study = await this.studies.find(studyId);
    if (!study) throw new NotFoundException("Studio non trovato");

    const requestedIds = new Set(propertyIds);
    const selectedProperties = study.properties.filter((property) => requestedIds.has(property.id));
    if (selectedProperties.length !== propertyIds.length) {
      const availableIds = new Set(study.properties.map((property) => property.id));
      const invalidIds = propertyIds.filter((propertyId) => !availableIds.has(propertyId));
      throw new BadRequestException(
        invalidIds.length > 0
          ? `Gli immobili ${invalidIds.join(", ")} non appartengono allo studio`
          : "La selezione immobili contiene duplicati",
      );
    }

    const generatedAt = new Date();
    const snapshot: PresentationSnapshot = {
      version: 1,
      generatedAt: generatedAt.toISOString(),
      studio: {
        id: study.id,
        company: study.company,
        vat: study.vat,
        comune: study.comune,
        provincia: study.provincia,
        commercialOwner: study.commercialOwner,
        technicalOwner: study.technicalOwner,
      },
      immobili: selectedProperties.map((property) => ({
        id: property.id,
        societa: study.company,
        comune: property.comune || study.comune,
        indirizzo: property.address || property.ubicazione || "Ubicazione non disponibile",
        foglioParticellaSub: cadastralReference(property.foglio, property.particella, property.subalterno),
        categoria: property.categoria,
        renditaAttuale: Number(property.currentRendita),
        renditaAttribuibile: Number(property.estimatedRendita),
        imuAttuale: property.currentImu === null ? null : Number(property.currentImu),
        imuOttenibile: property.estimatedImu === null ? null : Number(property.estimatedImu),
      })),
    };
    const fileName = presentationFileName(study.company, generatedAt);
    const deck = await this.prisma.presentationDeck.create({
      data: {
        studyId: study.id,
        propertyIds: selectedProperties.map((property) => property.id),
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        fileName,
      },
    });
    return toSummary(deck);
  }

  async list(studyId: string) {
    const decks = await this.prisma.presentationDeck.findMany({
      where: { studyId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return decks.map(toSummary);
  }

  async renderHtml(id: string) {
    const deck = await this.findDeck(id);
    return {
      html: await this.renderSnapshot(deck.snapshot as unknown as PresentationSnapshot),
      fileName: deck.fileName.replace(/\.pdf$/i, ".html"),
    };
  }

  async renderPdf(id: string) {
    const deck = await this.findDeck(id);
    const cached = this.pdfCache.get(id);
    if (cached) return { pdf: cached, fileName: deck.fileName };

    const html = await this.renderSnapshot(deck.snapshot as unknown as PresentationSnapshot);
    const browser = await this.browser();
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    try {
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
      await page.waitForSelector("#assets-ready", { state: "attached", timeout: 30_000 });
      await page.emulateMedia({ media: "print" });
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        tagged: false,
      });
      this.cachePdf(id, pdf);
      return { pdf, fileName: deck.fileName };
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    if (this.browserPromise) await (await this.browserPromise).close();
  }

  private async findDeck(id: string) {
    const deck = await this.prisma.presentationDeck.findUnique({ where: { id } });
    if (!deck) throw new NotFoundException("Presentazione non trovata");
    return deck;
  }

  private renderSnapshot(snapshot: PresentationSnapshot) {
    return this.template().then((template) => template.replace(
      "__SOUL_DECK_DATA__",
      serializeForInlineScript(snapshot),
    ));
  }

  private template() {
    this.templatePromise ??= inlineTemplateAssets();
    return this.templatePromise;
  }

  private browser() {
    this.browserPromise ??= chromium.launch({
      headless: true,
      executablePath: this.chromiumExecutablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    }).catch((error) => {
      this.browserPromise = undefined;
      throw error;
    });
    return this.browserPromise;
  }

  private cachePdf(id: string, pdf: Buffer) {
    this.pdfCache.set(id, pdf);
    if (this.pdfCache.size <= 8) return;
    const oldestKey = this.pdfCache.keys().next().value as string | undefined;
    if (oldestKey) this.pdfCache.delete(oldestKey);
  }
}

async function inlineTemplateAssets() {
  let template = await readFile(fileURLToPath(TEMPLATE_URL), "utf8");
  await Promise.all(Object.entries(ASSET_URLS).map(async ([placeholder, asset]) => {
    const body = await readFile(fileURLToPath(asset.url));
    const dataUrl = `data:${asset.contentType};base64,${body.toString("base64")}`;
    template = template.replaceAll(placeholder, dataUrl);
  }));
  return template;
}

function serializeForInlineScript(value: PresentationSnapshot) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function cadastralReference(foglio: string | null, particella: string | null, subalterno: string | null) {
  const parts = [
    foglio ? `Fg. ${foglio}` : null,
    particella ? `Part. ${particella}` : null,
    subalterno ? `Sub. ${subalterno}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : "Dati catastali non disponibili";
}

function presentationFileName(company: string, createdAt: Date) {
  const slug = company
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "cliente";
  return `proposta-rideterminazione-${slug}-${createdAt.toISOString().slice(0, 10)}.pdf`;
}

function toSummary(deck: {
  id: string;
  studyId: string;
  propertyIds: Prisma.JsonValue;
  fileName: string;
  createdAt: Date;
}): PresentationSummary {
  const propertyIds = Array.isArray(deck.propertyIds)
    ? deck.propertyIds.filter((value): value is string => typeof value === "string")
    : [];
  return {
    id: deck.id,
    studyId: deck.studyId,
    propertyIds,
    propertyCount: propertyIds.length,
    fileName: deck.fileName,
    createdAt: deck.createdAt.toISOString(),
    htmlUrl: `/api/presentations/${encodeURIComponent(deck.id)}`,
    pdfUrl: `/api/presentations/${encodeURIComponent(deck.id)}/pdf`,
  };
}
