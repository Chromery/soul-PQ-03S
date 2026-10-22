import { BadRequestException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { assertStorageKey, assertDocumentStorageKey, decodePdfUpload, safeStoragePart } from "./storage-policy.js";

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
  private readonly logger = new Logger(DocumentStorageService.name);
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
    const buffer = await decodePdfUpload(input.fileBase64);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (input.expectedSha256 && input.expectedSha256.toLowerCase() !== sha256) {
      throw new BadRequestException(`SHA256 non coerente per ${input.fileNome}`);
    }

    const safeStudy = safeStoragePart(input.studioErpId);
    const safeProperty = safeStoragePart(input.immobileErpId);
    const safeType = safeStoragePart(input.tipo);
    const safeFileName = safeFile(input.fileNome);
    const storageKey = path.posix.join(
      this.keyPrefix,
      safeStudy,
      safeProperty,
      safeType,
      `${sha256.slice(0, 12)}-${safeFileName}`,
    );

    assertDocumentStorageKey(storageKey, this.keyPrefix);
    await this.putObject(storageKey, buffer, sha256, input.fileNome);

    return {
      storageKey,
      sha256,
      sizeBytes: buffer.byteLength,
    };
  }

  async readPdfObject(storageKey: string) {
    assertDocumentStorageKey(storageKey, this.keyPrefix);
    return this.readObject(storageKey, "application/pdf");
  }

  async deleteObject(storageKey: string) {
    assertDocumentStorageKey(storageKey, this.keyPrefix);
    await this.storageRequest("delete", () => this.client().send(
      new DeleteObjectCommand({
        Bucket: this.requireBucket(),
        Key: storageKey,
      }),
    ));
  }

  async readObject(storageKey: string, fallbackContentType = "application/octet-stream") {
    assertStorageKey(storageKey);
    try {
      const output = await this.storageRequest("read", () => this.client().send(
        new GetObjectCommand({
          Bucket: this.requireBucket(),
          Key: storageKey,
        }),
      ));
      if (!output.Body) throw new NotFoundException("Documento non trovato nello storage S3");
      return {
        stream: await toReadable(output.Body),
        contentType: output.ContentType ?? fallbackContentType,
        contentLength: output.ContentLength,
      };
    } catch (error) {
      if (isMissingObjectError(error)) {
        throw new NotFoundException("Documento non trovato nello storage S3");
      }
      throw error;
    }
  }

  private async putObject(key: string, body: Buffer, sha256: string, fileName: string) {
    const bucket = this.requireBucket();
    await this.storageRequest("write", () => this.client().send(
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
    ));
  }

  private async storageRequest<T>(operation: "read" | "write" | "delete", request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      // Preserve application validation and genuine missing-object responses.
      if (error instanceof HttpException || (operation === "read" && isMissingObjectError(error))) throw error;
      const details = storageFailure(error);
      if (!details) throw error;
      // Do not log SDK messages, request bodies, document keys or credentials.
      this.logger.error(JSON.stringify({ event: "document_storage_unavailable", operation, ...details }));
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "Service Unavailable",
        code: "STORAGE_UNAVAILABLE",
        reason: details.reason,
        message: details.reason === "ACCOUNT_SUSPENDED"
          ? "Storage documenti non disponibile: il servizio di archiviazione segnala l'account sospeso. Contattare l'amministratore PQ e riprovare dopo il ripristino del servizio."
          : "Storage documenti non disponibile. Impossibile completare l'operazione: contattare l'amministratore PQ e riprovare dopo il ripristino del servizio.",
      });
    }
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

function safeFile(value: string) {
  const base = path.basename(value.trim());
  return safeStoragePart(base || "documento.pdf");
}

async function toReadable(body: NonNullable<GetObjectCommandOutput["Body"]>) {
  if (body instanceof Readable) return body;
  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformable.transformToByteArray === "function") {
    const bytes = await transformable.transformToByteArray();
    return Readable.from(Buffer.from(bytes));
  }
  throw new InternalServerErrorException("Formato risposta S3 non supportato");
}

function isMissingObjectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  // A missing bucket is a storage configuration problem, not a missing document.
  if (candidate.name === "NoSuchBucket" || candidate.Code === "NoSuchBucket") return false;
  return candidate.name === "NoSuchKey" || candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404;
}

function storageFailure(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { name?: string; Code?: string; code?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
  const codes = [candidate.name, candidate.Code, candidate.code];
  const transportCodes = ["TimeoutError", "RequestTimeout", "RequestTimeoutException", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN"];
  const providerCodes = ["UserSuspended", "AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "NoSuchBucket", "ServiceUnavailable", "SlowDown", "InternalError"];
  if (!(error instanceof S3ServiceException) && !candidate.$metadata?.httpStatusCode
    && !codes.some(code => code && [...transportCodes, ...providerCodes].includes(code))) return null;
  return {
    reason: codes.includes("UserSuspended") ? "ACCOUNT_SUSPENDED" : "UNAVAILABLE",
    providerCode: safeDiagnosticIdentifier(candidate.Code ?? candidate.code ?? candidate.name),
    providerStatus: candidate.$metadata?.httpStatusCode,
    providerRequestId: safeDiagnosticIdentifier(candidate.$metadata?.requestId),
  };
}

function safeDiagnosticIdentifier(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_./+=-]{1,200}$/.test(value) ? value : undefined;
}
