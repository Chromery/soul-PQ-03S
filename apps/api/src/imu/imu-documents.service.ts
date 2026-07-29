import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { IMU_RATE_RECORDS } from "./imu-rates.generated.js";
import type { ImuRateRecord } from "./imu.types.js";

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

@Injectable()
export class ImuDocumentsService {
  private readonly recordsBySha256 = new Map<string, ImuRateRecord>();
  private readonly verifiedDocuments = new Map<string, Promise<LocalDocument>>();
  private readonly libraryDirectory: string;

  constructor(config: ConfigService) {
    for (const record of IMU_RATE_RECORDS) {
      if (/^[a-f0-9]{64}$/i.test(record.sha256)) {
        this.recordsBySha256.set(record.sha256.toLowerCase(), record);
      }
    }
    this.libraryDirectory = path.resolve(config.get<string>(
      "IMU_DOCUMENT_LIBRARY_DIR",
      config.get<string>(
        "IMU_DOCUMENT_CACHE_DIR",
        path.join(tmpdir(), "soul-pq-imu-delibere"),
      ),
    ));
  }

  async open(inputSha256: string) {
    const sha256 = inputSha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new NotFoundException("Delibera non trovata");
    }
    const record = this.recordsBySha256.get(sha256);
    if (!record?.sourcePath) throw new NotFoundException("Delibera non trovata");

    const document = await this.openLocalDocument(record);
    return {
      fileName: path.basename(record.sourcePath) || `${sha256}.pdf`,
      contentLength: document.contentLength,
      stream: createReadStream(document.filePath),
    };
  }

  private async openLocalDocument(record: ImuRateRecord) {
    const sha256 = record.sha256.toLowerCase();
    const verified = this.verifiedDocuments.get(sha256);
    if (verified) return verified;
    const verification = this.verifyLocalDocument(record).catch((error) => {
      this.verifiedDocuments.delete(sha256);
      throw error;
    });
    this.verifiedDocuments.set(sha256, verification);
    return verification;
  }

  private async verifyLocalDocument(record: ImuRateRecord): Promise<LocalDocument> {
    const filePath = this.localDocumentPath(record.sourcePath);
    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile() || fileStats.size <= 5 || fileStats.size > MAX_DOCUMENT_BYTES) {
        throw new ServiceUnavailableException("PDF della delibera non valido nella libreria del server");
      }
      const buffer = await readFile(filePath);
      if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
        throw new ServiceUnavailableException("PDF della delibera non valido nella libreria del server");
      }
      const actualSha256 = createHash("sha256").update(buffer).digest("hex");
      if (actualSha256 !== record.sha256.toLowerCase()) {
        throw new ServiceUnavailableException(
          "Il PDF sul server non corrisponde alla versione usata per il calcolo IMU",
        );
      }
      return { filePath, contentLength: fileStats.size };
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new NotFoundException("PDF della delibera non disponibile sul server");
      }
      throw error;
    }
  }

  private localDocumentPath(sourcePath: string) {
    const normalizedSourcePath = sourcePath.replaceAll("\\", "/");
    const filePath = path.resolve(this.libraryDirectory, normalizedSourcePath);
    if (
      path.isAbsolute(normalizedSourcePath) ||
      !filePath.startsWith(`${this.libraryDirectory}${path.sep}`)
    ) {
      throw new NotFoundException("Percorso della delibera non valido");
    }
    return filePath;
  }
}

type LocalDocument = {
  filePath: string;
  contentLength: number;
};

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
