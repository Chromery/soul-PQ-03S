import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PDFDocument } from "pdf-lib";
import type { Browser, Page } from "playwright-core";
import { chromium } from "playwright-core";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StudiesService } from "../studies/studies.service.js";
import type {
  PresentationSnapshot,
  PresentationSummary,
} from "./presentations.types.js";

const TEMPLATE_URL = new URL("./templates/soul-deck.html", import.meta.url);
const HYBRID_SLIDES = [
  { number: 3, format: "jpeg", quality: 93 },
  { number: 4, format: "jpeg", quality: 93 },
  { number: 5, format: "png" },
] as const;
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

    const snapshot = deck.snapshot as unknown as PresentationSnapshot;
    const html = await this.renderSnapshot(snapshot);
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "soul-pq-slides-export-"));
    const htmlPath = path.join(temporaryDirectory, "deck.html");
    const nativePdfPath = path.join(temporaryDirectory, "native.pdf");
    try {
      await writeFile(htmlPath, html, "utf8");
      const browser = await this.browser();
      await createNativePdf(browser, htmlPath, nativePdfPath);
      const captures = await captureHybridSlides(browser, htmlPath, temporaryDirectory);
      const pdf = await composeHybridPdf(nativePdfPath, captures, snapshot);
      this.cachePdf(id, pdf);
      return { pdf, fileName: deck.fileName };
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
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

type HybridCapture = {
  format: "jpeg" | "png";
  path: string;
};

async function waitForDeck(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForSelector("#assets-ready", { state: "attached", timeout: 30_000 });
  await page.evaluate(async () => {
    const requestFrame = (globalThis as unknown as {
      requestAnimationFrame: (callback: () => void) => number;
    }).requestAnimationFrame;
    await new Promise<void>((resolve) => requestFrame(() => requestFrame(() => resolve())));
  });
}

function exportUrl(input: string, slide = 1) {
  const url = pathToFileURL(input);
  url.searchParams.set("export", "1");
  url.hash = `slide-${slide}`;
  return url.href;
}

async function createNativePdf(browser: Browser, input: string, destination: string) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  try {
    await page.goto(exportUrl(input), { waitUntil: "load", timeout: 30_000 });
    await waitForDeck(page);
    await page.pdf({
      path: destination,
      width: "16in",
      height: "9in",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });
  } finally {
    await page.close();
  }
}

async function captureHybridSlides(browser: Browser, input: string, directory: string) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  });
  const captures = new Map<number, HybridCapture>();
  try {
    for (const slide of HYBRID_SLIDES) {
      await page.goto(exportUrl(input, slide.number), { waitUntil: "load", timeout: 30_000 });
      await waitForDeck(page);
      const extension = slide.format === "jpeg" ? "jpg" : "png";
      const destination = path.join(directory, `slide-${slide.number}.${extension}`);
      if (slide.format === "jpeg") {
        await page.screenshot({
          path: destination,
          type: "jpeg",
          quality: slide.quality,
          animations: "disabled",
          fullPage: false,
        });
      } else {
        await page.screenshot({
          path: destination,
          type: "png",
          animations: "disabled",
          fullPage: false,
        });
      }
      captures.set(slide.number, { format: slide.format, path: destination });
    }
  } finally {
    await page.close();
  }
  return captures;
}

async function composeHybridPdf(
  nativePdfPath: string,
  captures: Map<number, HybridCapture>,
  snapshot: PresentationSnapshot,
) {
  const nativePdf = await PDFDocument.load(await readFile(nativePdfPath));
  const pageCount = nativePdf.getPageCount();
  const invalidSlide = HYBRID_SLIDES.find((slide) => slide.number > pageCount);
  if (invalidSlide) {
    throw new Error(`La presentazione contiene ${pageCount} pagine: impossibile acquisire la pagina ${invalidSlide.number}`);
  }

  const outputPdf = await PDFDocument.create();
  const referencePage = nativePdf.getPage(0);
  const { width, height } = referencePage.getSize();

  for (let slideNumber = 1; slideNumber <= pageCount; slideNumber += 1) {
    const capture = captures.get(slideNumber);
    if (!capture) {
      const [nativePage] = await outputPdf.copyPages(nativePdf, [slideNumber - 1]);
      outputPdf.addPage(nativePage);
      continue;
    }

    const imageBytes = await readFile(capture.path);
    const image = capture.format === "jpeg"
      ? await outputPdf.embedJpg(imageBytes)
      : await outputPdf.embedPng(imageBytes);
    const page = outputPdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  outputPdf.setTitle("Rideterminazione rendita catastale");
  outputPdf.setAuthor("Soul S.r.l.");
  outputPdf.setCreator("Soul slides hybrid exporter");
  outputPdf.setSubject(`Proposta per ${snapshot.studio.company}`);
  outputPdf.setCreationDate(new Date(snapshot.generatedAt));
  return Buffer.from(await outputPdf.save({ useObjectStreams: true }));
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
