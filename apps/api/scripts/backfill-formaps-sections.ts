import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { DocumentStorageService } from "../src/erp-sync/document-storage.service.js";
import {
  resolveFormapsTerritory,
  type FormapsTerritoryCandidate,
} from "../src/formaps-territories/formaps-territory-resolver.js";
import { DocumentType, VisuraExtractionStatus } from "../src/generated/prisma/enums.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import {
  extractCadastralDataFromText,
  extractTextFromPdf,
  municipalityWithSection,
  municipalityWithoutSection,
} from "../src/visura-extraction/visura-text-extractor.js";

type Proposal = {
  propertyId: string;
  sourcePropertyId: string;
  documentId: string;
  sourceFileName: string;
  sourceSha256: string;
  direct: boolean;
  territory: FormapsTerritoryCandidate;
  comune: string;
  provincia: string;
  sezioneCatastale: string | null;
  codiceComuneCatastale: string;
  foglio: string;
  particella: string;
  evidence: string | null;
};

const apply = process.argv.includes("--apply");
const propertyFilter = process.argv.find((argument) => argument.startsWith("--property="))?.slice("--property=".length);
dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
const config = new ConfigService(process.env);
const prisma = new PrismaService(config);
await prisma.onModuleInit();
const storage = new DocumentStorageService(config);

try {
  const [documents, properties] = await Promise.all([
    prisma.propertyDocument.findMany({
      where: {
        type: DocumentType.VISURA,
        ...(propertyFilter ? { propertyId: propertyFilter } : {}),
      },
      include: { property: true },
      orderBy: [{ propertyId: "asc" }],
    }),
    prisma.property.findMany({
      select: {
        id: true,
        studyId: true,
        provincia: true,
        comune: true,
        foglio: true,
        particella: true,
        sezioneCatastale: true,
        codiceComuneCatastale: true,
        formapsMunicipalityId: true,
      },
    }),
  ]);
  const propertiesById = new Map(properties.map((property) => [property.id, property]));
  const propertiesByParcel = groupPropertiesByParcel(properties);
  const proposals = new Map<string, Proposal[]>();
  const documentResults: Array<Record<string, unknown>> = [];
  const skippedExistingTerritories: Array<Record<string, unknown>> = [];

  for (const document of documents) {
    if (document.storageKey.startsWith("demo/")) {
      documentResults.push({ propertyId: document.propertyId, status: "missing_demo_storage" });
      continue;
    }
    try {
      const stored = await storage.readPdfObject(document.storageKey);
      const buffer = await streamToBuffer(stored.stream);
      const text = await extractTextFromPdf(buffer);
      const extracted = extractCadastralDataFromText(text);
      const resolution = resolveFormapsTerritory(
        extracted.provincia,
        municipalityWithSection(extracted.comune, extracted.sezioneCatastale),
      );
      const territory = resolution.selected;
      if (!extracted.found || !territory || !extracted.foglio || !extracted.particella) {
        documentResults.push({
          propertyId: document.propertyId,
          status: extracted.found ? resolution.strategy : "text_incomplete",
          comune: extracted.comune,
          provincia: extracted.provincia,
          sezioneCatastale: extracted.sezioneCatastale,
        });
        continue;
      }
      const coherence = documentMatchesProperty(document.property, extracted, territory);
      if (!coherence.matches) {
        documentResults.push({
          propertyId: document.propertyId,
          status: "document_property_mismatch",
          mismatches: coherence.mismatches,
          stored: {
            provincia: document.property.provincia,
            comune: document.property.comune,
            foglio: document.property.foglio,
            particella: document.property.particella,
          },
          extracted: {
            provincia: extracted.provincia,
            comune: extracted.comune,
            foglio: extracted.foglio,
            particella: extracted.particella,
          },
        });
        continue;
      }
      const section = territory.municipality.match(/\/\s*sez\.\s*([A-Z0-9-]+)/i)?.[1]?.toUpperCase() ?? null;
      const baseProposal = {
        sourcePropertyId: document.propertyId,
        documentId: document.id,
        sourceFileName: document.fileName,
        sourceSha256: document.sha256 ?? createHash("sha256").update(buffer).digest("hex"),
        territory,
        comune: municipalityWithoutSection(territory.municipality) ?? extracted.comune ?? document.property.comune,
        provincia: territory.provinceId,
        sezioneCatastale: section,
        codiceComuneCatastale: extracted.codiceComuneCatastale
          ?? cadastralCodeFromFormaps(territory.municipalityId, section),
        foglio: extracted.foglio,
        particella: extracted.particella,
        evidence: extracted.evidence,
      };
      addProposal(proposals, { propertyId: document.propertyId, direct: true, ...baseProposal });
      const parcelKey = propertyParcelKey(
        document.property.studyId,
        extracted.comune,
        extracted.foglio,
        extracted.particella,
      );
      let propagatedToSameParcel = 0;
      for (const sibling of propertiesByParcel.get(parcelKey) ?? []) {
        if (sibling.id === document.propertyId) continue;
        if (
          sibling.formapsMunicipalityId
          && sibling.formapsMunicipalityId.toUpperCase() !== territory.municipalityId.toUpperCase()
        ) {
          skippedExistingTerritories.push({
            propertyId: sibling.id,
            storedFormapsMunicipalityId: sibling.formapsMunicipalityId,
            proposedFormapsMunicipalityId: territory.municipalityId,
            sourcePropertyId: document.propertyId,
          });
          continue;
        }
        addProposal(proposals, { propertyId: sibling.id, direct: false, ...baseProposal });
        propagatedToSameParcel += 1;
      }
      documentResults.push({
        propertyId: document.propertyId,
        status: "resolved",
        formapsMunicipalityId: territory.municipalityId,
        sezioneCatastale: section,
        propagatedToSameParcel,
      });
    } catch (error) {
      documentResults.push({
        propertyId: document.propertyId,
        status: "error",
        error: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  }

  const accepted: Proposal[] = [];
  const conflicts: Array<Record<string, unknown>> = [];
  for (const [propertyId, candidates] of proposals) {
    const ids = Array.from(new Set(candidates.map((candidate) => candidate.territory.municipalityId)));
    if (ids.length !== 1) {
      conflicts.push({ propertyId, municipalityIds: ids });
      continue;
    }
    const candidate = candidates.find((proposal) => proposal.direct) ?? candidates[0];
    const current = propertiesById.get(propertyId);
    if (!current || proposalChangesProperty(current, candidate)) accepted.push(candidate);
  }

  if (apply) {
    await prisma.$transaction(async (tx) => {
      for (const proposal of accepted) {
        await tx.property.update({
          where: { id: proposal.propertyId },
          data: {
            comune: proposal.comune,
            provincia: proposal.provincia,
            sezioneCatastale: proposal.sezioneCatastale,
            codiceComuneCatastale: proposal.codiceComuneCatastale,
            formapsMunicipalityId: proposal.territory.municipalityId,
          },
        });
      }
      for (const proposal of accepted.filter((candidate) => candidate.direct)) {
        const now = new Date();
        const jobId = `deterministic-visura-${proposal.documentId}`;
        const rawResponse = {
          found: true,
          provincia: proposal.provincia,
          comune: proposal.comune,
          foglio: proposal.foglio,
          particella: proposal.particella,
          sezioneCatastale: proposal.sezioneCatastale,
          codiceComuneCatastale: proposal.codiceComuneCatastale,
          formapsMunicipalityId: proposal.territory.municipalityId,
          extractionMethod: "deterministic_pdf_text",
          confidence: 0.99,
          evidence: proposal.evidence,
          warnings: ["Backfill deterministico dal testo nativo del PDF."],
        };
        await tx.visuraExtractionJob.upsert({
          where: { id: jobId },
          create: {
            id: jobId,
            propertyId: proposal.propertyId,
            documentId: proposal.documentId,
            status: VisuraExtractionStatus.SUCCEEDED,
            model: "deterministic-pdftotext-v1",
            sourceFileName: proposal.sourceFileName,
            sourceSha256: proposal.sourceSha256,
            extractedProvincia: proposal.provincia,
            extractedComune: proposal.comune,
            extractedFoglio: proposal.foglio,
            extractedParticella: proposal.particella,
            extractedSezioneCatastale: proposal.sezioneCatastale,
            extractedCodiceComuneCatastale: proposal.codiceComuneCatastale,
            extractedFormapsMunicipalityId: proposal.territory.municipalityId,
            extractionMethod: "deterministic_pdf_text",
            confidence: 0.99,
            evidence: proposal.evidence,
            warnings: rawResponse.warnings as Prisma.InputJsonValue,
            rawResponse: rawResponse as unknown as Prisma.InputJsonValue,
            startedAt: now,
            completedAt: now,
          },
          update: {
            status: VisuraExtractionStatus.SUCCEEDED,
            extractedProvincia: proposal.provincia,
            extractedComune: proposal.comune,
            extractedFoglio: proposal.foglio,
            extractedParticella: proposal.particella,
            extractedSezioneCatastale: proposal.sezioneCatastale,
            extractedCodiceComuneCatastale: proposal.codiceComuneCatastale,
            extractedFormapsMunicipalityId: proposal.territory.municipalityId,
            extractionMethod: "deterministic_pdf_text",
            confidence: 0.99,
            evidence: proposal.evidence,
            warnings: rawResponse.warnings as Prisma.InputJsonValue,
            rawResponse: rawResponse as unknown as Prisma.InputJsonValue,
            errorMessage: null,
            startedAt: now,
            completedAt: now,
          },
        });
      }
    });
  }

  const summary = documentResults.reduce<Record<string, number>>((counts, item) => {
    const status = String(item.status);
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  process.stdout.write(`${JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    documents: documents.length,
    documentStatus: summary,
    propertyUpdates: accepted.length,
    directPropertyUpdates: accepted.filter((proposal) => proposal.direct).length,
    propagatedPropertyUpdates: accepted.filter((proposal) => !proposal.direct).length,
    conflicts,
    skippedExistingTerritories,
    updates: accepted.map((proposal) => ({
      propertyId: proposal.propertyId,
      sourcePropertyId: proposal.sourcePropertyId,
      direct: proposal.direct,
      formapsMunicipalityId: proposal.territory.municipalityId,
      sezioneCatastale: proposal.sezioneCatastale,
    })),
    results: documentResults,
  }, null, 2)}\n`);
} finally {
  await prisma.onModuleDestroy();
}

function addProposal(target: Map<string, Proposal[]>, proposal: Proposal) {
  target.set(proposal.propertyId, [...(target.get(proposal.propertyId) ?? []), proposal]);
}

function groupPropertiesByParcel<T extends {
  id: string;
  studyId: string;
  comune: string;
  foglio: string | null;
  particella: string | null;
}>(properties: T[]) {
  const groups = new Map<string, T[]>();
  for (const property of properties) {
    if (!property.foglio || !property.particella) continue;
    const key = propertyParcelKey(property.studyId, property.comune, property.foglio, property.particella);
    groups.set(key, [...(groups.get(key) ?? []), property]);
  }
  return groups;
}

function propertyParcelKey(studyId: string, comune: string | null, foglio: string, particella: string) {
  return [studyId, normalizedTerritory(comune), foglio.trim().toUpperCase(), particella.trim().toUpperCase()].join("|");
}

function normalizedTerritory(value: string | null) {
  return (municipalityWithoutSection(value) ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Z0-9]+/gi, "")
    .toUpperCase();
}

function normalizedIdentifier(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/^0+(?=\d)/, "");
}

function documentMatchesProperty(
  property: {
    provincia: string;
    comune: string;
    foglio: string | null;
    particella: string | null;
    sezioneCatastale: string | null;
    formapsMunicipalityId: string | null;
  },
  extracted: {
    provincia: string | null;
    comune: string | null;
    foglio: string | null;
    particella: string | null;
    sezioneCatastale: string | null;
  },
  territory: FormapsTerritoryCandidate,
) {
  const mismatches: string[] = [];
  if (
    normalizedIdentifier(property.foglio)
    && normalizedIdentifier(extracted.foglio)
    && normalizedIdentifier(property.foglio) !== normalizedIdentifier(extracted.foglio)
  ) {
    mismatches.push("foglio");
  }
  if (
    normalizedIdentifier(property.particella)
    && normalizedIdentifier(extracted.particella)
    && normalizedIdentifier(property.particella) !== normalizedIdentifier(extracted.particella)
  ) {
    mismatches.push("particella");
  }

  const storedMunicipality = normalizedTerritory(property.comune);
  const targetMunicipality = normalizedTerritory(territory.municipality);
  const storedIdMatches = property.formapsMunicipalityId?.trim().toUpperCase()
    === territory.municipalityId.toUpperCase();
  const storedResolution = resolveFormapsTerritory(
    property.provincia,
    municipalityWithSection(property.comune, property.sezioneCatastale),
  );
  const storedResolutionMatches = storedResolution.selected?.municipalityId.toUpperCase()
    === territory.municipalityId.toUpperCase();
  if (
    storedMunicipality
    && storedMunicipality !== targetMunicipality
    && !storedIdMatches
    && !storedResolutionMatches
  ) {
    mismatches.push("comune");
  }

  return { matches: mismatches.length === 0, mismatches };
}

function cadastralCodeFromFormaps(municipalityId: string, section: string | null) {
  return section && municipalityId.toUpperCase().endsWith(section)
    ? municipalityId.slice(0, -section.length)
    : municipalityId;
}

function proposalChangesProperty(
  property: {
    provincia: string | null;
    comune: string;
    sezioneCatastale: string | null;
    codiceComuneCatastale: string | null;
    formapsMunicipalityId: string | null;
  },
  proposal: Proposal,
) {
  return normalizedTerritory(property.comune) !== normalizedTerritory(proposal.comune)
    || normalizedIdentifier(property.provincia) !== normalizedIdentifier(proposal.provincia)
    || normalizedIdentifier(property.sezioneCatastale) !== normalizedIdentifier(proposal.sezioneCatastale)
    || normalizedIdentifier(property.codiceComuneCatastale) !== normalizedIdentifier(proposal.codiceComuneCatastale)
    || normalizedIdentifier(property.formapsMunicipalityId)
      !== normalizedIdentifier(proposal.territory.municipalityId);
}

async function streamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
