// Incremental import of one verified catalog source. Run inside the API container:
// node apps/api/scripts/import-catalog-source.mjs <document-sha256> [--apply]
// Dry-run by default. Never replaces unrelated sources, studies or valuations.
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../dist/prisma/prisma.service.js";
import { PriceListsService, rankPriceLists } from "../dist/price-lists/price-lists.service.js";

const required = (name) => { if (!process.env[name]) throw Error(`${name} non configurata`); return process.env[name]; };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function main() {
  const [documentId, mode] = process.argv.slice(2);
  if (!/^[a-f0-9]{64}$/.test(documentId || "") || (mode && mode !== "--apply"))
    throw Error("Uso: import-catalog-source.mjs <sha256> [--apply]");
  const catalog = JSON.parse(await readFile(new URL("../dist/price-lists/data/catalog.generated.json", import.meta.url), "utf8"));
  const doc = catalog.documents.find(d => d.id === documentId);
  if (!doc || doc.role !== "price-list" || !doc.province || doc.format !== "pdf")
    throw Error("Occorre un prontuario PDF provinciale verificato nel catalogo");
  const root = await realpath(process.env.PRICE_RULE_SOURCE_DIR || "/var/lib/soul-pq/price-list-sources");
  const file = await realpath(path.join(root, doc.file));
  if (!file.startsWith(root + path.sep)) throw Error("Percorso sorgente non valido");
  const bytes = await readFile(file);
  if (digest(bytes) !== documentId) throw Error("SHA-256 sorgente diverso dal catalogo");
  // Match the existing bulk importer's key convention, so a later full import
  // cannot create another object/record for this same sourcePath.
  const safePart = value => String(value).trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
  const storageKey = `prezzari/provincia/${safePart(doc.territory)}/${documentId.slice(0,12)}-${safePart(path.basename(doc.file))}`;
  const data = { title: doc.title.replace(/\.pdf$/i, ""), fileName: path.basename(doc.file), storageKey,
    mimeType: "application/pdf", sha256: documentId, sizeBytes: bytes.length, sourcePath: doc.file,
    territoryName: doc.territory, territoryScope: "PROVINCIA", comune: null,
    provincia: doc.province, region: doc.region, year: doc.year, priority: 40 };
  const prisma = new PrismaService(new ConfigService(process.env));
  try {
    const previous = await prisma.priceList.findUnique({where:{storageKey}});
    if (previous && previous.sha256 !== documentId) throw Error("Conflitto con una fonte già presente");
    const sourceMatch = await prisma.priceList.findUnique({where:{sourcePath:doc.file}});
    if (sourceMatch && sourceMatch.id !== previous?.id) throw Error("Fonte già importata con chiave diversa: riconciliare prima dell'importazione");
    const current = await prisma.priceList.findMany();
    const candidate = { ...data, id: previous?.id || "candidate", latitude: null, longitude: null };
    const all = [...current.filter(p => p.id !== previous?.id), candidate];
    const properties = await prisma.property.findMany({select:{id:true, address:true, comune:true, provincia:true,
      study:{select:{provincia:true,region:true}}}});
    const affected = properties.filter(p => rankPriceLists(p, all).slice(0,5)
      .some(m => m.priceList.id === candidate.id && m.reason === "Provincia corrispondente"));
    console.log(JSON.stringify({apply:mode === "--apply",source:doc.file,sha256:documentId,bytes:bytes.length,storageKey,matchingProperties:affected.length}));
    if (mode !== "--apply") return;
    const s3 = new S3Client({endpoint:required("S3_ENDPOINT"),region:process.env.S3_REGION || "us-east-1",
      forcePathStyle:process.env.S3_FORCE_PATH_STYLE !== "false",requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED",
      credentials:{accessKeyId:required("S3_ACCESS_KEY_ID"),secretAccessKey:required("S3_SECRET_ACCESS_KEY")}});
    const Bucket = required("S3_BUCKET");
    await s3.send(new PutObjectCommand({Bucket,Key:storageKey,Body:bytes,ContentType:data.mimeType,Metadata:{sha256:documentId}}));
    const check = await s3.send(new GetObjectCommand({Bucket,Key:storageKey}));
    if (digest(await check.Body.transformToByteArray()) !== documentId) throw Error("Verifica download S3 fallita");
    const imported = await prisma.priceList.upsert({where:{storageKey},create:data,update:data});
    const service = new PriceListsService(prisma, null);
    for (const property of affected) await service.assignForProperty(property.id);
    console.log(JSON.stringify({importedId:imported.id,sha256:documentId,s3ReadBackVerified:true,updatedAssociations:affected.length,valuationsChanged:0}));
    s3.destroy();
  } finally { await prisma.onModuleDestroy(); }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
