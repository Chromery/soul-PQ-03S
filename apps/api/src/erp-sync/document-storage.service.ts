import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
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
  private readonly endpoint?: string;
  private readonly region: string;
  private readonly bucket?: string;
  private readonly accessKeyId?: string;
  private readonly secretAccessKey?: string;
  private readonly forcePathStyle: boolean;
  private readonly keyPrefix: string;
  private s3Client?: S3Client;

  constructor(config: ConfigService) {
    this.endpoint = optionalConfig(config.get<string>("S3_ENDPOINT"));
    this.region = optionalConfig(config.get<string>("S3_REGION")) ?? "us-west-004";
    this.bucket = optionalConfig(config.get<string>("S3_BUCKET"));
    this.accessKeyId = optionalConfig(config.get<string>("S3_ACCESS_KEY_ID"));
    this.secretAccessKey = optionalConfig(config.get<string>("S3_SECRET_ACCESS_KEY"));
    this.forcePathStyle = config.get<string>("S3_FORCE_PATH_STYLE", "true") !== "false";
    this.keyPrefix = optionalConfig(config.get<string>("S3_KEY_PREFIX")) ?? "erp";
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
    const storageKey = path.posix.join(
      safePathPart(this.keyPrefix),
      safeStudy,
      safeProperty,
      safeType,
      `${sha256.slice(0, 12)}-${safeFileName}`,
    );

    await this.putObject(storageKey, buffer, sha256, input.fileNome);

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

  private async putObject(key: string, body: Buffer, sha256: string, fileName: string) {
    const bucket = this.requireBucket();
    await this.client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/pdf",
        ContentLength: body.byteLength,
        Metadata: {
          sha256,
          file_name: fileName,
        },
      }),
    );
  }

  private client() {
    if (this.s3Client) return this.s3Client;
    const endpoint = this.requireValue(this.endpoint, "S3_ENDPOINT");
    const accessKeyId = this.requireValue(this.accessKeyId, "S3_ACCESS_KEY_ID");
    const secretAccessKey = this.requireValue(this.secretAccessKey, "S3_SECRET_ACCESS_KEY");
    this.s3Client = new S3Client({
      endpoint,
      region: this.region,
      forcePathStyle: this.forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    return this.s3Client;
  }

  private requireBucket() {
    return this.requireValue(this.bucket, "S3_BUCKET");
  }

  private requireValue(value: string | undefined, name: string) {
    if (value && !value.includes("REPLACE_")) return value;
    throw new InternalServerErrorException(`${name} non configurato per upload documenti ERP`);
  }
}

function optionalConfig(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function safePathPart(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function safeFile(value: string) {
  const base = path.basename(value.trim());
  return safePathPart(base || "documento.pdf");
}
