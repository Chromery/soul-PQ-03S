import { BadGatewayException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { IMU_RATE_RECORDS } from "./imu-rates.generated.js";
import type { ImuRateRecord } from "./imu.types.js";

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

@Injectable()
export class ImuDocumentsService {
  private readonly recordsBySha256 = new Map<string, ImuRateRecord>();
  private readonly pendingDownloads = new Map<string, Promise<string>>();
  private readonly cacheDirectory: string;
  private readonly repository: string;
  private readonly repositoryRef: string;
  private readonly githubToken?: string;

  constructor(config: ConfigService) {
    for (const record of IMU_RATE_RECORDS) {
      if (/^[a-f0-9]{64}$/i.test(record.sha256)) {
        this.recordsBySha256.set(record.sha256.toLowerCase(), record);
      }
    }
    this.cacheDirectory = config.get<string>(
      "IMU_DOCUMENT_CACHE_DIR",
      path.join(tmpdir(), "soul-pq-imu-delibere"),
    );
    this.repository = config.get<string>("IMU_SOURCE_REPOSITORY", "Chromery/soul-delibere-rk");
    this.repositoryRef = config.get<string>("IMU_SOURCE_REF", "main");
    this.githubToken = optionalValue(
      config.get<string>("GITHUB_TOKEN") ?? config.get<string>("GH_TOKEN"),
    );
  }

  async open(inputSha256: string) {
    const sha256 = inputSha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new NotFoundException("Delibera non trovata");
    }
    const record = this.recordsBySha256.get(sha256);
    if (!record?.sourcePath) throw new NotFoundException("Delibera non trovata");

    const filePath = await this.ensureCached(record);
    const fileStats = await stat(filePath);
    return {
      fileName: path.basename(record.sourcePath) || `${sha256}.pdf`,
      contentLength: fileStats.size,
      stream: createReadStream(filePath),
    };
  }

  private async ensureCached(record: ImuRateRecord) {
    const sha256 = record.sha256.toLowerCase();
    const destination = path.join(this.cacheDirectory, `${sha256}.pdf`);
    if (await isUsableFile(destination)) return destination;

    const pending = this.pendingDownloads.get(sha256);
    if (pending) return pending;

    const download = this.downloadAndVerify(record, destination).finally(() => {
      this.pendingDownloads.delete(sha256);
    });
    this.pendingDownloads.set(sha256, download);
    return download;
  }

  private async downloadAndVerify(record: ImuRateRecord, destination: string) {
    await mkdir(this.cacheDirectory, { recursive: true });
    const temporaryPath = `${destination}.${process.pid}.${Date.now()}.tmp`;
    try {
      const response = await fetch(this.githubContentsUrl(record.sourcePath), {
        headers: {
          Accept: "application/vnd.github.raw+json",
          "User-Agent": "soul-pq-imu-documents",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(this.githubToken ? { Authorization: `Bearer ${this.githubToken}` } : {}),
        },
      });
      if (!response.ok) {
        throw new BadGatewayException(
          response.status === 401 || response.status === 403 || response.status === 404
            ? "PDF della delibera non disponibile: accesso alla repository sorgente non configurato"
            : `PDF della delibera non disponibile dalla sorgente (HTTP ${response.status})`,
        );
      }

      const declaredSize = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredSize) && declaredSize > MAX_DOCUMENT_BYTES) {
        throw new BadGatewayException("PDF della delibera troppo grande");
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_DOCUMENT_BYTES || !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
        throw new BadGatewayException("La sorgente della delibera non ha restituito un PDF valido");
      }
      const actualSha256 = createHash("sha256").update(buffer).digest("hex");
      if (actualSha256 !== record.sha256.toLowerCase()) {
        throw new BadGatewayException("Il PDF della delibera non corrisponde alla versione usata per il calcolo IMU");
      }

      await writeFile(temporaryPath, buffer, { flag: "wx" });
      await rename(temporaryPath, destination);
      return destination;
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private githubContentsUrl(sourcePath: string) {
    const encodedPath = sourcePath.split("/").map(encodeURIComponent).join("/");
    return `https://api.github.com/repos/${this.repository}/contents/${encodedPath}?ref=${encodeURIComponent(this.repositoryRef)}`;
  }
}

async function isUsableFile(filePath: string) {
  try {
    return (await stat(filePath)).size > 5;
  } catch {
    return false;
  }
}

function optionalValue(value?: string) {
  const normalized = value?.trim();
  return normalized || undefined;
}
