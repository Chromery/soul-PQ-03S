import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type StoreDocumentInput = {
  studioErpId: string;
  immobileErpId: string;
  tipo: string;
  fileNome: string;
  fileBase64: string;
  expectedSha256?: string;
};

@Injectable()
export class DocumentStorageService {
  private readonly rootPath: string;

  constructor(config: ConfigService) {
    this.rootPath = config.get<string>("ERP_DOCUMENT_STORAGE_PATH", path.join(process.cwd(), "storage", "erp-documents"));
  }

  async storeBase64Pdf(input: StoreDocumentInput) {
    const buffer = this.decodeBase64(input.fileBase64, input.fileNome);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (input.expectedSha256 && input.expectedSha256.toLowerCase() !== sha256) {
      throw new BadRequestException(`SHA256 non coerente per ${input.fileNome}`);
    }

    const safeStudy = safePathPart(input.studioErpId);
    const safeProperty = safePathPart(input.immobileErpId);
    const safeType = safePathPart(input.tipo);
    const safeFileName = safeFile(input.fileNome);
    const storageKey = path.posix.join("erp", safeStudy, safeProperty, safeType, `${sha256.slice(0, 12)}-${safeFileName}`);
    const absolutePath = path.join(this.rootPath, storageKey);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);

    return {
      storageKey,
      sha256,
      sizeBytes: buffer.byteLength,
    };
  }

  private decodeBase64(value: string, fileName: string) {
    const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
    if (!payload.trim()) throw new BadRequestException(`file_base64 mancante per ${fileName}`);

    const buffer = Buffer.from(payload, "base64");
    if (buffer.byteLength === 0) throw new BadRequestException(`file_base64 non valido per ${fileName}`);
    return buffer;
  }
}

function safePathPart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function safeFile(value: string) {
  const base = path.basename(value.trim());
  return safePathPart(base || "documento.pdf");
}
