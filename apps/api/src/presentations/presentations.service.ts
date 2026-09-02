import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PDFDocument } from "pdf-lib";
import type { Browser, Page } from "playwright-core";
import { chromium } from "playwright-core";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AddressNormalizationService } from "../address-normalization/address-normalization.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { StudiesService } from "../studies/studies.service.js";
import type {
  PresentationPropertyInput,
  PresentationSnapshot,
  PresentationSummary,
} from "./presentations.types.js";

const TEMPLATE_URLS = {
  1: new URL("./templates/soul-deck.html", import.meta.url),
  2: new URL("./templates/soul-deck-v2.html", import.meta.url),
  3: new URL("./templates/soul-deck-v2.html", import.meta.url),
} as const;
const V3_BASE_PDF_URL = new URL(
  "../../../../visual reference/soul_realestate_rendita_catastale_new_template.pdf",
  import.meta.url,
);
const HYBRID_SLIDES_V1 = [
  { number: 3, format: "jpeg", quality: 93 },
  { number: 4, format: "jpeg", quality: 93 },
  { number: 5, format: "png" },
] as const;
const HYBRID_SLIDES_V2 = [
  { number: 2, format: "jpeg", quality: 94 },
  { number: 3, format: "jpeg", quality: 94 },
  { number: 4, format: "jpeg", quality: 94 },
  { number: 5, format: "png" },
] as const;
const HYBRID_SLIDES_V3 = [
  { number: 5, format: "png" },
] as const;
const ASSET_URLS = {
  __ASSET_INTER__: { url: new URL("../../../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", import.meta.url), contentType: "font/woff2" },
  __ASSET_RALEWAY__: { url: new URL("../../../../node_modules/@fontsource-variable/raleway/files/raleway-latin-wght-normal.woff2", import.meta.url), contentType: "font/woff2" },
  __ASSET_ROBOTO__: { url: new URL("../../../../node_modules/@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2", import.meta.url), contentType: "font/woff2" },
  __ASSET_LOGO__: { url: new URL("./templates/assets/soul-logo.svg", import.meta.url), contentType: "image/svg+xml" },
  __ASSET_COVER__: { url: new URL("./templates/assets/soul-exterior-mountain-facade.jpg", import.meta.url), contentType: "image/jpeg" },
  __ASSET_RECEPTION__: { url: new URL("./templates/assets/soul-reception.png", import.meta.url), contentType: "image/png" },
  __ASSET_ATRIUM__: { url: new URL("./templates/assets/soul-atrium-lounge-wide.jpg", import.meta.url), contentType: "image/jpeg" },
  __ASSET_PROCESS__: { url: new URL("./templates/assets/soul-entrance-lobby.jpg", import.meta.url), contentType: "image/jpeg" },
  __ASSET_HANDSHAKE__: { url: new URL("./templates/assets/soul-handshake.png", import.meta.url), contentType: "image/png" },
} as const;

type PresentationStudy = NonNullable<Awaited<ReturnType<StudiesService["find"]>>>;
type PresentationSourceProperty = {
  study: PresentationStudy;
  property: PresentationStudy["properties"][number];
};
type PresentationOwner = { studyId: string; studyGroupId?: never } | { studyId?: never; studyGroupId: string };

@Injectable()
export class PresentationsService implements OnModuleDestroy {
  private readonly templatePromises = new Map<1 | 2 | 3, Promise<string>>();
  private browserPromise?: Promise<Browser>;
  private readonly pdfCache = new Map<string, Buffer>();
  private readonly chromiumExecutablePath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly studies: StudiesService,
    private readonly addressNormalization: AddressNormalizationService,
    config: ConfigService,
  ) {
    this.chromiumExecutablePath = config.get<string>("CHROMIUM_EXECUTABLE_PATH", "/usr/bin/chromium");
  }

  async create(
    studyId: string,
    propertyIds: string[],
    propertyInputs: PresentationPropertyInput[] = [],
    clientName?: string,
  ) {
    return this.createVersion(1, studyId, propertyIds, propertyInputs, clientName);
  }

  async createV2(
    studyId: string,
    propertyIds: string[],
    propertyInputs: PresentationPropertyInput[] = [],
    clientName?: string,
  ) {
    return this.createVersion(2, studyId, propertyIds, propertyInputs, clientName);
  }

  async createV3(
    studyId: string,
    propertyIds: string[],
    propertyInputs: PresentationPropertyInput[] = [],
    clientName?: string,
  ) {
    return this.createVersion(3, studyId, propertyIds, propertyInputs, clientName);
  }

  async createStudyGroupV3(
    studyGroupId: string,
    propertyIds: string[],
    propertyInputs: PresentationPropertyInput[] = [],
    clientName?: string,
  ) {
    const group = await this.prisma.studyGroup.findUnique({
      where: { id: studyGroupId },
      select: { id: true, name: true, studies: { select: { id: true }, orderBy: { createdAt: "asc" } } },
    });
    if (!group) throw new NotFoundException("Gruppo studi non trovato");
    const studies = await Promise.all(group.studies.map(({ id }) => this.studies.find(id)));
    if (studies.some((study) => !study)) throw new NotFoundException("Uno studio del gruppo non è più disponibile");
    const resolvedStudies = studies as PresentationStudy[];
    const groupName = normalizedPresentationText(group.name)
      || defaultStudyGroupName(resolvedStudies.map((study) => study.company));
    return this.createFromSources({
      version: 3,
      owner: { studyGroupId },
      clientName: normalizePresentationText(clientName, groupName),
      studio: {
        id: group.id,
        vat: uniquePresentationText(resolvedStudies.map((study) => study.vat)),
        comune: uniquePresentationText(resolvedStudies.map((study) => study.comune)),
        provincia: uniquePresentationText(resolvedStudies.map((study) => study.provincia)),
        commercialOwner: uniquePresentationText(resolvedStudies.map((study) => study.commercialOwner)),
        technicalOwner: uniquePresentationText(resolvedStudies.map((study) => study.technicalOwner)),
      },
      sources: resolvedStudies.flatMap((study) => (
        study.properties.map((property) => ({ study, property }))
      )),
      propertyIds,
      propertyInputs,
    });
  }

  private async createVersion(
    version: 1 | 2 | 3,
    studyId: string,
    propertyIds: string[],
    propertyInputs: PresentationPropertyInput[] = [],
    clientName?: string,
  ) {
    const study = await this.studies.find(studyId);
    if (!study) throw new NotFoundException("Studio non trovato");

    return this.createFromSources({
      version,
      owner: { studyId: study.id },
      clientName: normalizePresentationText(clientName, study.company),
      studio: {
        id: study.id,
        vat: study.vat,
        comune: study.comune,
        provincia: study.provincia,
        commercialOwner: study.commercialOwner,
        technicalOwner: study.technicalOwner,
      },
      sources: study.properties.map((property) => ({ study, property })),
      propertyIds,
      propertyInputs,
    });
  }

  private async createFromSources(input: {
    version: 1 | 2 | 3;
    owner: PresentationOwner;
    clientName: string;
    studio: Omit<PresentationSnapshot["studio"], "company">;
    sources: PresentationSourceProperty[];
    propertyIds: string[];
    propertyInputs: PresentationPropertyInput[];
  }) {
    const { version, owner, clientName, studio, sources, propertyIds, propertyInputs } = input;

    const requestedIds = new Set(propertyIds);
    const selectedSources = sources.filter(({ property }) => requestedIds.has(property.id));
    if (selectedSources.length !== propertyIds.length) {
      const availableIds = new Set(sources.map(({ property }) => property.id));
      const invalidIds = propertyIds.filter((propertyId) => !availableIds.has(propertyId));
      throw new BadRequestException(
        invalidIds.length > 0
          ? `Gli immobili ${invalidIds.join(", ")} non appartengono alla selezione`
          : "La selezione immobili contiene duplicati",
      );
    }

    const selectedIdSet = new Set(selectedSources.map(({ property }) => property.id));
    const invalidInputIds = propertyInputs
      .map((property) => property.id)
      .filter((propertyId) => !selectedIdSet.has(propertyId));
    if (invalidInputIds.length > 0) {
      throw new BadRequestException(
        `I dati personalizzati degli immobili ${invalidInputIds.join(", ")} non appartengono alla selezione`,
      );
    }
    const propertyInputById = new Map(propertyInputs.map((property) => [property.id, property]));

    const generatedAt = new Date();
    const snapshotProperties = await Promise.all(selectedSources.map(async ({ study, property }) => {
      const input = propertyInputById.get(property.id);
      let humanReadableAddress = normalizedPresentationText(property.humanReadableAddress);
      if (!humanReadableAddress) {
        humanReadableAddress = await this.addressNormalization.normalize({
          address: property.address,
          ubicazione: property.ubicazione,
          comune: property.comune || study.comune,
          provincia: property.provincia || study.provincia,
        });
        if (humanReadableAddress) {
          await this.prisma.property.update({
            where: { id: property.id },
            data: { humanReadableAddress },
          });
        }
      }
      return {
        id: property.id,
        societa: normalizePresentationText(input?.societa, study.company),
        comune: presentationMunicipality(
          normalizePresentationText(input?.comune, property.comune || study.comune),
          property.provincia || study.provincia,
        ),
        indirizzo: presentationAddress(
          input?.indirizzo,
          humanReadableAddress,
          property.address,
          property.ubicazione,
        ),
        foglioParticellaSub: normalizePresentationText(
          input?.foglioParticellaSub,
          cadastralReference(property.foglio, property.particella, property.subalterno),
        ),
        categoria: normalizePresentationText(input?.categoria, property.categoria),
        renditaAttuale: toCurrencyPrecision(input?.renditaAttuale ?? Number(property.currentRendita)),
        renditaAttribuibile: toCurrencyPrecision(
          input?.renditaAttribuibile ?? Number(property.estimatedRendita),
        ),
        imuAttuale: toOptionalCurrencyPrecision(
          input ? input.imuAttuale : property.currentImu == null ? null : Number(property.currentImu),
        ),
        imuOttenibile: toOptionalCurrencyPrecision(
          input ? input.imuOttenibile : property.estimatedImu == null ? null : Number(property.estimatedImu),
        ),
      };
    }));
    const snapshot: PresentationSnapshot = {
      version,
      generatedAt: generatedAt.toISOString(),
      studio: {
        ...studio,
        company: clientName,
      },
      immobili: snapshotProperties,
    };
    const fileName = presentationFileName(snapshot.studio.company, generatedAt, version);
    const deck = await this.prisma.presentationDeck.create({
      data: {
        ...owner,
        propertyIds: selectedSources.map(({ property }) => property.id),
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        fileName,
      },
    });
    return toSummary({ ...deck, snapshot });
  }

  async list(studyId: string) {
    const decks = await this.prisma.presentationDeck.findMany({
      where: { studyId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return decks.map(toSummary);
  }

  async listStudyGroup(studyGroupId: string) {
    const decks = await this.prisma.presentationDeck.findMany({
      where: { studyGroupId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return decks.map(toSummary);
  }

  async renderHtml(id: string) {
    const deck = await this.findDeck(id);
    const snapshot = deck.snapshot as unknown as PresentationSnapshot;
    if (snapshot.version === 3) {
      throw new BadRequestException("La presentazione v3 è disponibile esclusivamente in formato PDF");
    }
    return {
      html: await this.renderSnapshot(snapshot),
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
      const exportConfig = exportConfigFor(snapshot.version);
      const captures = await captureHybridSlides(browser, htmlPath, temporaryDirectory, exportConfig);
      const pdf = snapshot.version === 3
        ? await composeV3Pdf(captures, snapshot)
        : await createHybridPdf(
            browser,
            htmlPath,
            nativePdfPath,
            captures,
            snapshot,
            exportConfig,
          );
      this.cachePdf(id, pdf);
      return { pdf, fileName: deck.fileName };
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async renderV3Pdf(id: string) {
    const deck = await this.findDeck(id);
    if (presentationVersion(deck.snapshot) !== 3) {
      throw new NotFoundException("Presentazione v3 non trovata");
    }
    return this.renderPdf(id);
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
    return this.template(snapshot.version).then((template) => template.replace(
      "__SOUL_DECK_DATA__",
      serializeForInlineScript(snapshot),
    ));
  }

  private template(version: 1 | 2 | 3) {
    const existing = this.templatePromises.get(version);
    if (existing) return existing;
    const template = inlineTemplateAssets(TEMPLATE_URLS[version]);
    this.templatePromises.set(version, template);
    return template;
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

type HybridSlide = {
  number: number;
  format: "jpeg" | "png";
  quality?: number;
};

type ExportConfig = {
  viewport: { width: number; height: number };
  pageWidth: string;
  pageHeight: string;
  hybridSlides: readonly HybridSlide[];
};

function exportConfigFor(version: 1 | 2 | 3): ExportConfig {
  return version >= 2
    ? {
        viewport: { width: 1400, height: 990 },
        pageWidth: "297mm",
        pageHeight: "210mm",
        hybridSlides: version === 3 ? HYBRID_SLIDES_V3 : HYBRID_SLIDES_V2,
      }
    : {
        viewport: { width: 1600, height: 900 },
        pageWidth: "16in",
        pageHeight: "9in",
        hybridSlides: HYBRID_SLIDES_V1,
      };
}

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

function exportUrl(input: string, slide?: number) {
  const url = pathToFileURL(input);
  url.searchParams.set("export", "1");
  if (slide) url.hash = `slide-${slide}`;
  return url.href;
}

async function createNativePdf(
  browser: Browser,
  input: string,
  destination: string,
  config: ExportConfig,
) {
  const page = await browser.newPage({
    viewport: config.viewport,
    deviceScaleFactor: 1,
  });
  try {
    await page.goto(exportUrl(input), { waitUntil: "load", timeout: 30_000 });
    await waitForDeck(page);
    await page.pdf({
      path: destination,
      width: config.pageWidth,
      height: config.pageHeight,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });
  } finally {
    await page.close();
  }
}

async function captureHybridSlides(
  browser: Browser,
  input: string,
  directory: string,
  config: ExportConfig,
) {
  const captures = new Map<number, HybridCapture>();
  for (const slide of config.hybridSlides) {
    const page = await browser.newPage({
      viewport: config.viewport,
      deviceScaleFactor: 2,
    });
    try {
      await page.goto(exportUrl(input, slide.number), { waitUntil: "load", timeout: 30_000 });
      await waitForDeck(page);
      const target = page.locator(`#slide-${slide.number}`);
      await target.scrollIntoViewIfNeeded();
      const extension = slide.format === "jpeg" ? "jpg" : "png";
      const destination = path.join(directory, `slide-${slide.number}.${extension}`);
      if (slide.format === "jpeg") {
        await target.screenshot({
          path: destination,
          type: "jpeg",
          quality: slide.quality,
          animations: "disabled",
        });
      } else {
        await target.screenshot({
          path: destination,
          type: "png",
          animations: "disabled",
        });
      }
      captures.set(slide.number, { format: slide.format, path: destination });
    } finally {
      await page.close();
    }
  }
  return captures;
}

async function createHybridPdf(
  browser: Browser,
  htmlPath: string,
  nativePdfPath: string,
  captures: Map<number, HybridCapture>,
  snapshot: PresentationSnapshot,
  config: ExportConfig,
) {
  await createNativePdf(browser, htmlPath, nativePdfPath, config);
  return composeHybridPdf(nativePdfPath, captures, snapshot, config.hybridSlides);
}

async function composeHybridPdf(
  nativePdfPath: string,
  captures: Map<number, HybridCapture>,
  snapshot: PresentationSnapshot,
  hybridSlides: readonly HybridSlide[],
) {
  const nativePdf = await PDFDocument.load(await readFile(nativePdfPath));
  const pageCount = nativePdf.getPageCount();
  const invalidSlide = hybridSlides.find((slide) => slide.number > pageCount);
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

  setPdfMetadata(outputPdf, snapshot);
  return Buffer.from(await outputPdf.save({ useObjectStreams: true }));
}

async function composeV3Pdf(
  captures: Map<number, HybridCapture>,
  snapshot: PresentationSnapshot,
) {
  const templatePdf = await PDFDocument.load(await readFile(fileURLToPath(V3_BASE_PDF_URL)));
  if (templatePdf.getPageCount() < 5) {
    throw new Error("Il template PDF v3 non contiene la pagina 5 da sostituire");
  }

  const economicsCapture = captures.get(5);
  if (!economicsCapture) {
    throw new Error("La pagina economica dinamica della presentazione v3 non è stata generata");
  }

  const outputPdf = await PDFDocument.create();
  for (let pageIndex = 0; pageIndex < templatePdf.getPageCount(); pageIndex += 1) {
    if (pageIndex !== 4) {
      const [templatePage] = await outputPdf.copyPages(templatePdf, [pageIndex]);
      outputPdf.addPage(templatePage);
      continue;
    }

    const { width, height } = templatePdf.getPage(pageIndex).getSize();
    const imageBytes = await readFile(economicsCapture.path);
    const image = economicsCapture.format === "jpeg"
      ? await outputPdf.embedJpg(imageBytes)
      : await outputPdf.embedPng(imageBytes);
    const page = outputPdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  setPdfMetadata(outputPdf, snapshot, "Soul PDF v3 hybrid exporter");
  return Buffer.from(await outputPdf.save({ useObjectStreams: true }));
}

function setPdfMetadata(
  outputPdf: PDFDocument,
  snapshot: PresentationSnapshot,
  creator = "Soul slides hybrid exporter",
) {
  outputPdf.setTitle("Ottimizzazione rendita catastale");
  outputPdf.setAuthor("Soul S.r.l.");
  outputPdf.setCreator(creator);
  outputPdf.setSubject(`Proposta per ${snapshot.studio.company}`);
  outputPdf.setCreationDate(new Date(snapshot.generatedAt));
}

async function inlineTemplateAssets(templateUrl: URL) {
  let template = await readFile(fileURLToPath(templateUrl), "utf8");
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

function presentationFileName(company: string, createdAt: Date, version: 1 | 2 | 3) {
  if (version >= 2) {
    const normalizedCompany = company
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.\s]+$/, "") || "Cliente";
    const date = new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Rome",
    }).format(createdAt).replaceAll("/", "-");
    const versionSuffix = version === 3 ? " _ v3" : "";
    return `Studio di fattibilità _ Ottimizzazione rendita catastale _ ${normalizedCompany} _ ${date}${versionSuffix}.pdf`;
  }
  const slug = company
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "cliente";
  return `proposta-ottimizzazione-${slug}-${createdAt.toISOString().slice(0, 10)}.pdf`;
}

function normalizePresentationText(input: string | undefined, fallback: string) {
  const normalized = input?.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizedPresentationText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function uniquePresentationText(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizedPresentationText).filter((value): value is string => Boolean(value))))
    .join(" · ");
}

function defaultStudyGroupName(companies: string[]) {
  const names = uniquePresentationText(companies);
  return `Gruppo ${names || "studi selezionati"}`.slice(0, 240);
}

function presentationAddress(
  input: string | undefined,
  humanReadableAddress: string | null,
  rawAddress: string | null | undefined,
  ubicazione: string | null | undefined,
) {
  const normalizedInput = normalizedPresentationText(input);
  const fallback = humanReadableAddress
    ?? normalizedPresentationText(rawAddress)
    ?? normalizedPresentationText(ubicazione)
    ?? "Ubicazione non disponibile";
  if (!normalizedInput) return fallback;

  const comparableInput = comparablePresentationText(normalizedInput);
  const isUneditedRawValue = [rawAddress, ubicazione, "Ubicazione non disponibile"]
    .some((value) => comparablePresentationText(value) === comparableInput);
  return isUneditedRawValue ? fallback : normalizedInput;
}

function presentationMunicipality(value: string, province: string | null | undefined) {
  const withoutProvince = value.replace(/\s*\([A-Z]{2}\)\s*$/i, "").replace(/\s+/g, " ").trim();
  const humanReadable = humanizeMunicipality(withoutProvince);
  const normalizedProvince = province?.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  return normalizedProvince ? `${humanReadable} (${normalizedProvince})` : humanReadable;
}

function humanizeMunicipality(value: string) {
  if (!value || value !== value.toLocaleUpperCase("it-IT")) return value;
  const lowercaseWords = new Set(["a", "da", "dal", "dalla", "de", "del", "della", "delle", "di", "in", "sul"]);
  return value
    .toLocaleLowerCase("it-IT")
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && lowercaseWords.has(word)) return word;
      return word.replace(/(^|[-'])(\p{L})/gu, (_match, separator: string, letter: string) => (
        `${separator}${letter.toLocaleUpperCase("it-IT")}`
      ));
    })
    .join(" ");
}

function comparablePresentationText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().toLocaleLowerCase("it-IT") ?? "";
}

function toCurrencyPrecision(value: number) {
  return Math.round((value + 1e-9) * 100) / 100;
}

function toOptionalCurrencyPrecision(value: number | null | undefined) {
  return value === null || value === undefined ? null : toCurrencyPrecision(value);
}

function toSummary(deck: {
  id: string;
  studyId: string | null;
  studyGroupId: string | null;
  propertyIds: Prisma.JsonValue;
  snapshot: Prisma.JsonValue | PresentationSnapshot;
  fileName: string;
  createdAt: Date;
}): PresentationSummary {
  const propertyIds = Array.isArray(deck.propertyIds)
    ? deck.propertyIds.filter((value): value is string => typeof value === "string")
    : [];
  const version = presentationVersion(deck.snapshot);
  return {
    id: deck.id,
    version,
    studyId: deck.studyId,
    studyGroupId: deck.studyGroupId,
    propertyIds,
    propertyCount: propertyIds.length,
    fileName: deck.fileName,
    createdAt: deck.createdAt.toISOString(),
    htmlUrl: version === 3 ? null : `/api/presentations/${encodeURIComponent(deck.id)}`,
    htmlDownloadUrl: version === 3 ? null : `/api/presentations/${encodeURIComponent(deck.id)}/html`,
    pdfUrl: `/api/presentations/${encodeURIComponent(deck.id)}/pdf`,
  };
}

function presentationVersion(snapshot: Prisma.JsonValue | PresentationSnapshot): 1 | 2 | 3 {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && "version" in snapshot) {
    if (snapshot.version === 3) return 3;
    if (snapshot.version === 2) return 2;
  }
  return 1;
}
