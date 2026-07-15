import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { erpDocumentType, parseDocumentType } from "../document-types.js";
import { DocumentType } from "../generated/prisma/enums.js";
import type { FeasibilityStudy, PlanAnalysisDraft, Property, PropertyDocument, StudyVersion } from "../generated/prisma/client.js";
import { ImuService } from "../imu/imu.service.js";
import type { ImuCalculation } from "../imu/imu.types.js";
import { PriceListsService } from "../price-lists/price-lists.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { estimatedRenditaFromAnalysisDraft } from "../rendita.js";
import { ScaleExtractionService } from "../scale-extraction/scale-extraction.service.js";
import { VisuraExtractionService } from "../visura-extraction/visura-extraction.service.js";
import { DocumentStorageService } from "./document-storage.service.js";

type JsonRecord = Record<string, unknown>;

type PropertyWithRelations = Property & {
  documents: PropertyDocument[];
  analysisDraft: PlanAnalysisDraft | null;
};

type StudyWithRelations = FeasibilityStudy & {
  properties: PropertyWithRelations[];
  versions: StudyVersion[];
};

type NormalizedDocument = {
  type: DocumentType;
  erpDocumentId?: string;
  fileName: string;
  mimeType: string;
  fileBase64?: string;
  storageKey?: string;
  expectedSha256?: string;
  sizeBytes?: number;
};

type NormalizedProperty = {
  id: string;
  address: string;
  comune: string;
  provincia: string;
  ubicazione?: string;
  foglio?: string;
  particella?: string;
  subalterno?: string;
  categoria: string;
  titolarita?: string;
  currentRendita: number;
  estimatedRendita: number;
  diffPercent: number;
  currentImu: number | null;
  estimatedImu: number | null;
  imuDiff: number;
  outcome: string;
  hasStudy: boolean;
  displayOrder: number;
  documents: NormalizedDocument[];
};

@Injectable()
export class ErpSyncService {
  private readonly defaultTechnicalOwner: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly scaleExtraction: ScaleExtractionService,
    private readonly visuraExtraction: VisuraExtractionService,
    private readonly priceLists: PriceListsService,
    private readonly imu: ImuService,
    config: ConfigService,
  ) {
    this.defaultTechnicalOwner = config.get<string>("DEFAULT_TECHNICAL_OWNER", "Responsabile tecnico Soul");
  }

  assertAuthorized(authorization?: string) {
    const expectedToken = process.env.ERP_SYNC_TOKEN;
    if (!expectedToken) return;
    if (authorization !== `Bearer ${expectedToken}`) {
      throw new UnauthorizedException("Token ERP non valido");
    }
  }

  async syncStudies(body: unknown) {
    const payload = asRecord(body, "payload");
    const studies = asArray(payload.studi, "studi");
    if (studies.length === 0) throw new BadRequestException("studi deve contenere almeno uno studio");
    if (studies.length > 200) throw new BadRequestException("studi puo contenere al massimo 200 studi");

    const syncIdErp = optionalString(payload.sync_id_erp);
    const syncIdPq = `PQ-SYNC-${randomUUID()}`;
    const results = [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const [index, item] of studies.entries()) {
      const result = await this.upsertStudy(asRecord(item, `studi[${index}]`), syncIdErp);
      if (result.azione === "created") createdCount++;
      else updatedCount++;
      results.push(result);
    }

    return {
      sync_id_pq: syncIdPq,
      sync_id_erp: syncIdErp ?? null,
      stato: "completato",
      ricevuti: studies.length,
      creati: createdCount,
      aggiornati: updatedCount,
      risultati: results,
    };
  }

  async listModifiedStudies(modifiedAfter?: string) {
    const since = modifiedAfter ? parseDate(modifiedAfter, "modificati_dopo") : null;
    const studies = await this.prisma.feasibilityStudy.findMany({
      include: {
        properties: {
          include: { documents: true, analysisDraft: true },
          orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
        },
        versions: { orderBy: { versionNumber: "desc" } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const modifiedStudies = studies
      .map((study) => this.toErpResult(study))
      .filter((study) => !since || new Date(study.modificato_il) > since);

    return {
      generato_il: new Date().toISOString(),
      modificati_dopo: since?.toISOString() ?? null,
      totale: modifiedStudies.length,
      studi: modifiedStudies,
    };
  }

  private async upsertStudy(input: JsonRecord, syncIdErp?: string) {
    const studioErpId = requiredString(input.studio_erp_id, "studio_erp_id");
    const existing = await this.prisma.feasibilityStudy.findUnique({ where: { id: studioErpId } });
    const metrics = asOptionalRecord(input.metriche);
    const properties = asArray(input.immobili, "immobili");
    if (properties.length === 0) throw new BadRequestException("immobili deve contenere almeno un immobile");
    const normalizedProperties = properties.map((property, index) =>
      this.normalizeProperty(asRecord(property, `immobili[${index}]`), index),
    );

    const originalRendita = decimalNumber(
      metrics?.rendita_originale_totale,
      sum(normalizedProperties.map((property) => property.currentRendita)),
    );
    const totalRendita = decimalNumber(
      metrics?.rendita_proposta_totale,
      sum(normalizedProperties.map((property) => property.estimatedRendita)),
    );
    const diffRendita = decimalNumber(metrics?.differenza_rendita, totalRendita - originalRendita);
    const currentImu = decimalNumber(metrics?.imu_attuale_totale, sum(normalizedProperties.map((property) => property.currentImu ?? 0)));
    const estimatedImu = decimalNumber(metrics?.imu_prevista_totale, sum(normalizedProperties.map((property) => property.estimatedImu ?? 0)));
    const diffImu = decimalNumber(metrics?.differenza_imu, estimatedImu - currentImu);
    const firstProperty = normalizedProperties[0];
    const sede = asOptionalRecord(input.indirizzo_sede);
    const technicalOwner = ownerName(input.responsabile_tecnico) ?? this.defaultTechnicalOwner;
    const status = mapStudyStatus(optionalString(input.stato_studio));
    const now = new Date();
    const dataEsito = nullableDate(input.data_esito, "data_esito");
    const dataScadenza = optionalDate(input.data_scadenza, "data_scadenza") ?? addDays(now, 30);
    const dataCreazione = optionalDate(input.data_creazione_studio, "data_creazione_studio") ?? now;

    const createData = {
      id: studioErpId,
      companyErpId: optionalString(input.company_erp_id),
      company: requiredString(input.ragione_sociale ?? input.company_name, "ragione_sociale"),
      vat: requiredString(input.partita_iva ?? input.vat, "partita_iva"),
      comune: optionalString(sede?.comune) ?? firstProperty?.comune ?? "",
      provincia: optionalString(sede?.provincia) ?? firstProperty?.provincia ?? "",
      region: optionalString(sede?.regione) ?? "",
      status,
      createdAt: dataCreazione,
      concludedAt: dataEsito,
      deadline: dataScadenza,
      nextAppointment: nullableDate(input.data_prossimo_appuntamento, "data_prossimo_appuntamento"),
      diffRendita,
      diffImu,
      originalRendita,
      totalRendita,
      catDRendita: decimalNumber(metrics?.rendita_categoria_d, sum(normalizedProperties.filter((property) => isCategoryD(property.categoria)).map((property) => property.currentRendita))),
      commercialOwner: ownerName(input.commerciale_assegnato) ?? "Non assegnato",
      technicalOwner,
      notes: optionalString(input.note) ?? "",
      erpUrl: optionalString(input.link_studio_erp),
      erpImportedAt: nullableDate(input.data_importazione_erp, "data_importazione_erp"),
      erpUpdatedAt: nullableDate(input.updated_at_erp, "updated_at_erp"),
      sourceSyncId: syncIdErp,
    };

    for (const property of normalizedProperties) {
      for (const document of property.documents) {
        if (!document.fileBase64) continue;
        const stored = await this.storage.storeBase64Pdf({
          studioErpId,
          immobileErpId: property.id,
          tipo: erpDocumentType(document.type),
          fileNome: document.fileName,
          fileBase64: document.fileBase64,
          expectedSha256: document.expectedSha256,
        });
        document.storageKey = stored.storageKey;
        document.expectedSha256 = stored.sha256;
        document.sizeBytes = stored.sizeBytes;
      }
    }

    const updateData = {
      ...createData,
      id: undefined,
      notes: input.note === undefined ? undefined : createData.notes,
      technicalOwner: input.responsabile_tecnico === undefined ? existing?.technicalOwner ?? technicalOwner : technicalOwner,
    };

    await this.prisma.feasibilityStudy.upsert({
      where: { id: studioErpId },
      create: createData,
      update: updateData,
    });

    const versioneNumero = integerNumber(input.versione_numero, 1);
    await this.prisma.studyVersion.upsert({
      where: { studyId_versionNumber: { studyId: studioErpId, versionNumber: versioneNumero } },
      create: {
        studyId: studioErpId,
        versionNumber: versioneNumero,
        status,
        technicalOwner,
        notes: "Versione sincronizzata da ERP.",
      },
      update: {
        status,
        technicalOwner,
      },
    });

    let documentsCount = 0;
    let queuedVisuraExtractions = 0;
    const visuraExtractionErrors: Array<{ immobile_erp_id: string; file_nome: string; errore: string }> = [];
    for (const property of normalizedProperties) {
      const baseProperty = {
        studyId: studioErpId,
        address: property.address,
        comune: property.comune,
        provincia: property.provincia || null,
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
      await this.prisma.property.upsert({
        where: { id: property.id },
        create: { id: property.id, displayOrder: property.displayOrder, ...baseProperty },
        update: { displayOrder: property.displayOrder, ...baseProperty },
      });

      for (const document of property.documents) {
        const stored = {
          storageKey: document.storageKey,
          sha256: document.expectedSha256,
          sizeBytes: document.sizeBytes,
        };

        if (!stored.storageKey) throw new BadRequestException(`storage_key o file_base64 obbligatorio per ${document.fileName}`);
        const storedDocument = await this.prisma.propertyDocument.upsert({
          where: { propertyId_type: { propertyId: property.id, type: document.type } },
          create: {
            propertyId: property.id,
            type: document.type,
            erpDocumentId: document.erpDocumentId,
            fileName: document.fileName,
            storageKey: stored.storageKey,
            mimeType: document.mimeType,
            sha256: stored.sha256,
            sizeBytes: stored.sizeBytes,
          },
          update: {
            erpDocumentId: document.erpDocumentId,
            fileName: document.fileName,
            storageKey: stored.storageKey,
            mimeType: document.mimeType,
            sha256: stored.sha256,
            sizeBytes: stored.sizeBytes,
          },
        });
        if (document.type === DocumentType.PLANIMETRIA && document.fileBase64) {
          await this.scaleExtraction.enqueueDocumentPdf({
            propertyId: property.id,
            documentId: storedDocument.id,
            fileName: document.fileName,
            fileBase64: document.fileBase64,
            sha256: stored.sha256 ?? undefined,
          });
        }
        if (document.type === DocumentType.VISURA && document.fileBase64 && !hasCompleteCadastralData(property)) {
          try {
            await this.visuraExtraction.enqueueDocumentPdf({
              propertyId: property.id,
              documentId: storedDocument.id,
              fileName: document.fileName,
              fileBase64: document.fileBase64,
              sha256: stored.sha256 ?? undefined,
            });
            queuedVisuraExtractions++;
          } catch (error) {
            visuraExtractionErrors.push({
              immobile_erp_id: property.id,
              file_nome: document.fileName,
              errore: error instanceof Error ? error.message : "Errore sconosciuto",
            });
          }
        }
        documentsCount++;
      }
    }

    await this.priceLists.assignForStudy(studioErpId);

    return {
      studio_erp_id: studioErpId,
      azione: existing ? "updated" : "created",
      immobili_upserted: normalizedProperties.length,
      documenti_salvati: documentsCount,
      visure_estratte: 0,
      visure_in_coda: queuedVisuraExtractions,
      visure_errori: visuraExtractionErrors,
    };
  }

  private normalizeProperty(input: JsonRecord, index: number): NormalizedProperty {
    const id = requiredString(input.immobile_erp_id ?? input.erp_id, "immobile_erp_id");
    const currentRendita = decimalNumber(input.rendita_attuale ?? input.rendita, 0);
    const estimatedRendita = decimalNumber(input.rendita_proposta, 0);
    const currentImu = optionalDecimalNumber(input.imu_attuale);
    const estimatedImu = optionalDecimalNumber(input.imu_prevista);
    const categoria = normalizeCategory(optionalString(input.categoria) ?? optionalString(input.classamento) ?? "");
    const comune = optionalString(input.comune) ?? comuneFromUbicazione(optionalString(input.ubicazione)) ?? "";
    const diffPercent = currentRendita === 0 ? 0 : ((estimatedRendita - currentRendita) / currentRendita) * 100;
    return {
      id,
      address: optionalString(input.indirizzo_normalizzato) ?? optionalString(input.ubicazione) ?? "",
      comune,
      provincia: optionalString(input.provincia) ?? "",
      ubicazione: optionalString(input.ubicazione),
      foglio: optionalString(input.foglio),
      particella: optionalString(input.particella),
      subalterno: optionalString(input.sub ?? input.subalterno),
      categoria,
      titolarita: optionalString(input.titolarita),
      currentRendita,
      estimatedRendita,
      diffPercent,
      currentImu,
      estimatedImu,
      imuDiff: currentImu !== null && estimatedImu !== null ? estimatedImu - currentImu : 0,
      outcome: mapPropertyOutcome(optionalString(input.esito), Boolean(input.in_studio ?? input.in_study ?? input.is_study)),
      hasStudy: Boolean(input.in_studio ?? input.in_study ?? input.is_study),
      displayOrder: integerNumber(input.ordine_visualizzazione, index),
      documents: uniqueDocuments(
        asArray(input.documenti, "documenti").map((document, documentIndex) =>
          this.normalizeDocument(asRecord(document, `documenti[${documentIndex}]`)),
        ),
      ),
    };
  }

  private normalizeDocument(input: JsonRecord): NormalizedDocument {
    const rawType = requiredString(input.tipo, "documenti[].tipo");
    const type = parseDocumentType(rawType);
    const fileName = requiredString(input.file_nome, "documenti[].file_nome");
    const mimeType = optionalString(input.mime_type) ?? "application/pdf";
    if (mimeType !== "application/pdf") throw new BadRequestException(`mime_type non supportato per ${fileName}`);
    return {
      type,
      erpDocumentId: optionalString(input.documento_erp_id),
      fileName,
      mimeType,
      fileBase64: optionalString(input.file_base64),
      storageKey: optionalString(input.storage_key),
      expectedSha256: optionalString(input.sha256),
      sizeBytes: integerNumber(input.dimensione_byte, undefined),
    };
  }

  private toErpResult(study: StudyWithRelations) {
    const modifiedAt = maxDate([
      study.updatedAt,
      ...study.properties.map((property) => property.updatedAt),
      ...study.properties.flatMap((property) => property.documents.map((document) => document.updatedAt)),
      ...study.properties.flatMap((property) => (property.analysisDraft ? [property.analysisDraft.updatedAt] : [])),
    ]);
    const now = new Date();
    const calculatedProperties = study.properties.map((property) => {
      const currentRendita = Number(property.currentRendita);
      const estimatedRendita = estimatedRenditaFromAnalysisDraft(property.analysisDraft)
        ?? Number(property.estimatedRendita);
      const currentCalculation = this.calculateImu(currentRendita, property);
      const estimatedCalculation = estimatedRendita > 0 || property.hasStudy
        ? this.calculateImu(estimatedRendita, property)
        : null;
      return {
        property,
        estimatedRendita,
        currentImu: property.currentImu === null
          ? calculatedAmount(currentCalculation)
          : Number(property.currentImu),
        estimatedImu: calculatedAmount(estimatedCalculation)
          ?? (property.estimatedImu === null ? null : Number(property.estimatedImu)),
        estimatedCalculation,
      };
    });
    const currentImuTotal = sum(calculatedProperties.map((item) => item.currentImu ?? 0));
    const estimatedImuTotal = sum(calculatedProperties.map((item) => item.estimatedImu ?? 0));
    return {
      studio_erp_id: study.id,
      company_erp_id: study.companyErpId,
      ragione_sociale: study.company,
      partita_iva: study.vat,
      stato_studio: study.status,
      data_esito: study.concludedAt?.toISOString() ?? null,
      data_prossimo_appuntamento: study.nextAppointment?.toISOString() ?? null,
      appuntamento_attivo: Boolean(study.nextAppointment && study.nextAppointment > now),
      commerciale_assegnato: study.commercialOwner,
      responsabile_tecnico: study.technicalOwner,
      note: study.notes,
      link_studio_erp: study.erpUrl,
      modificato_il: modifiedAt.toISOString(),
      metriche: {
        rendita_originale_totale: decimalToString(study.originalRendita),
        rendita_proposta_totale: decimalToString(study.totalRendita),
        differenza_rendita: decimalToString(study.diffRendita),
        imu_attuale_totale: currentImuTotal.toFixed(2),
        imu_prevista_totale: estimatedImuTotal.toFixed(2),
        differenza_imu: (estimatedImuTotal - currentImuTotal).toFixed(2),
        rendita_categoria_d: decimalToString(study.catDRendita),
        numero_immobili: study.properties.length,
        numero_immobili_categoria_d: study.properties.filter((property) => isCategoryD(property.categoria)).length,
      },
      immobili: calculatedProperties.map(({ property, estimatedRendita, currentImu, estimatedImu, estimatedCalculation }) => ({
        immobile_erp_id: property.id,
        foglio: property.foglio,
        particella: property.particella,
        sub: property.subalterno,
        ubicazione: property.ubicazione,
        comune: property.comune,
        provincia: property.provincia,
        categoria: property.categoria,
        titolarita: property.titolarita,
        rendita_attuale: decimalToString(property.currentRendita),
        rendita_proposta: estimatedRendita.toFixed(2),
        imu_attuale: currentImu === null ? null : currentImu.toFixed(2),
        imu_prevista: estimatedImu === null ? null : estimatedImu.toFixed(2),
        calcolo_imu: estimatedCalculation,
        scala: property.scaleDenominator,
        formato_foglio: property.sheetSize,
        origine_scala: property.scaleSource,
        scala_ai: property.aiScaleDenominator,
        scala_ai_label: property.aiScaleLabel,
        formato_foglio_ai: property.aiSheetSize,
        confidenza_scala_ai: property.aiScaleConfidence === null ? null : decimalToString(property.aiScaleConfidence),
        scala_ai_rilevata_il: property.aiScaleDetectedAt?.toISOString() ?? null,
        in_studio: property.hasStudy,
        esito: property.outcome,
        documenti: property.documents.map((document) => ({
          tipo: erpDocumentType(document.type),
          file_nome: document.fileName,
          mime_type: document.mimeType,
          storage_key: document.storageKey,
          sha256: document.sha256,
          dimensione_byte: document.sizeBytes,
        })),
      })),
    };
  }

  private calculateImu(
    rendita: number,
    property: Pick<Property, "categoria" | "comune" | "provincia">,
  ) {
    return this.imu.calculate({
      rendita,
      categoria: property.categoria,
      comune: property.comune,
      provincia: property.provincia,
    });
  }
}

function asRecord(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException(`${path} deve essere un oggetto`);
  }
  return value as JsonRecord;
}

function asOptionalRecord(value: unknown): JsonRecord | null {
  if (value === undefined || value === null) return null;
  return asRecord(value, "oggetto");
}

function asArray(value: unknown, path: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new BadRequestException(`${path} deve essere una lista`);
  return value;
}

function optionalString(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return undefined;
  return value.trim() || undefined;
}

function requiredString(value: unknown, path: string) {
  const result = optionalString(value);
  if (!result) throw new BadRequestException(`${path} obbligatorio`);
  return result;
}

function decimalNumber(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) throw new BadRequestException(`Valore decimale non valido: ${String(value)}`);
  return parsed;
}

function optionalDecimalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return decimalNumber(value, 0);
}

function integerNumber(value: unknown, fallback: number): number;
function integerNumber(value: unknown, fallback: undefined): number | undefined;
function integerNumber(value: unknown, fallback: number | undefined) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new BadRequestException(`Intero non valido: ${String(value)}`);
  return parsed;
}

function parseDate(value: unknown, path: string) {
  const raw = requiredString(value, path);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${path} non e una data valida`);
  return parsed;
}

function optionalDate(value: unknown, path: string) {
  if (value === undefined || value === null || value === "") return null;
  return parseDate(value, path);
}

function nullableDate(value: unknown, path: string) {
  return optionalDate(value, path);
}

function ownerName(value: unknown) {
  if (typeof value === "string") return optionalString(value);
  const owner = asOptionalRecord(value);
  return optionalString(owner?.nome) ?? optionalString(owner?.email) ?? optionalString(owner?.erp_user_id);
}

function mapStudyStatus(value?: string) {
  const normalized = value?.toLowerCase();
  if (normalized === "da_iniziare") return "Da iniziare";
  if (normalized === "in_progress" || normalized === "in_lavorazione") return "In lavorazione";
  if (normalized === "in_revisione") return "In revisione";
  if (normalized === "concluso") return "Concluso";
  if (normalized === "archiviato") return "Archiviato";
  if (normalized === "annullato") return "Annullato";
  return value ?? "Da iniziare";
}

function mapPropertyOutcome(value: string | undefined, hasStudy: boolean) {
  const normalized = value?.toLowerCase();
  if (normalized === "positivo") return "Positivo";
  if (normalized === "negativo") return "Negativo";
  if (normalized === "neutro") return "Neutro";
  if (!hasStudy || normalized === "non_in_studio") return "Neutro";
  return "Neutro";
}

function uniqueDocuments(documents: NormalizedDocument[]) {
  const byType = new Map<DocumentType, NormalizedDocument>();
  for (const document of documents) byType.set(document.type, document);
  return Array.from(byType.values());
}

function hasCompleteCadastralData(property: Pick<NormalizedProperty, "provincia" | "comune" | "foglio" | "particella">) {
  return Boolean(property.provincia && property.comune && property.foglio && property.particella);
}

function normalizeCategory(value: string) {
  return value.replace(/^cat\.?/i, "").replace(/^c\.d\.?/i, "D").replace(/\s+/g, "").toUpperCase();
}

function comuneFromUbicazione(value?: string) {
  const match = value?.match(/^([A-ZÀ-Ü' -]+)\(/i);
  return match?.[1]?.trim();
}

function isCategoryD(value: string) {
  return /^D\//i.test(value) || /^D\d?/i.test(value);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function decimalToString(value: unknown) {
  return Number(value).toFixed(2);
}

function decimalAsNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculatedAmount(calculation: ImuCalculation | null) {
  return calculation?.status === "calculated" ? calculation.amount : null;
}

function maxDate(values: Date[]) {
  return values.reduce((latest, value) => (value > latest ? value : latest), values[0] ?? new Date(0));
}
