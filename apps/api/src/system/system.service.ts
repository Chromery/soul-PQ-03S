import { ConflictException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { PrismaService } from "../prisma/prisma.service.js";

type BackupInfo = {
  fileName: string;
  localPath: string;
  sizeBytes: number;
  createdAt: string;
  remoteKey: string;
  uploaded: boolean;
};

@Injectable()
export class SystemService {
  private backupRunning = false;
  private s3Client?: S3Client;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getStatus() {
    const [latestBackup, database] = await Promise.all([this.latestBackup(), this.databaseStats()]);
    return {
      generatedAt: new Date().toISOString(),
      environment: this.config.get<string>("NODE_ENV", "development"),
      database,
      storage: this.storageStatus(),
      backup: {
        configured: Boolean(optionalConfig(this.config.get<string>("DATABASE_URL"))),
        running: this.backupRunning,
        localDir: this.backupDir(),
        schedule: {
          timeLocal: optionalConfig(this.config.get<string>("BACKUP_TIME_LOCAL")) ?? "03:00",
          timezone: optionalConfig(this.config.get<string>("BACKUP_TZ")) ?? "Europe/Rome",
          retentionDays: integerConfig(this.config.get<string>("BACKUP_RETENTION_DAYS"), 14),
        },
        latest: latestBackup,
      },
      integrations: {
        erpSyncTokenConfigured: Boolean(optionalConfig(this.config.get<string>("ERP_SYNC_TOKEN"))),
        openRouterConfigured: Boolean(optionalConfig(this.config.get<string>("OPENROUTER_API_KEY"))),
        scaleModel: optionalConfig(this.config.get<string>("OPENROUTER_SCALE_MODEL")) ?? "qwen/qwen3.5-flash-02-23",
        visuraModel:
          optionalConfig(this.config.get<string>("OPENROUTER_VISURA_MODEL")) ??
          optionalConfig(this.config.get<string>("OPENROUTER_SCALE_MODEL")) ??
          "qwen/qwen3.5-flash-02-23",
        pdfEngine: optionalConfig(this.config.get<string>("OPENROUTER_PDF_ENGINE")) ?? "mistral-ocr",
        authentication: "not-configured",
      },
    };
  }

  async createBackup() {
    if (this.backupRunning) throw new ConflictException("Backup gia in corso");
    this.backupRunning = true;
    try {
      const backupDir = this.backupDir();
      await fs.mkdir(backupDir, { recursive: true });
      const fileName = `${this.databaseName()}-${timestamp()}.dump`;
      const localPath = path.join(backupDir, fileName);
      await this.runPgDump(localPath);
      const stat = await fs.stat(localPath);
      const remoteKey = this.remoteKey(fileName);
      const uploaded = await this.uploadBackup(localPath, remoteKey, stat.size);
      const info = {
        fileName,
        localPath,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        remoteKey,
        uploaded,
      };
      await this.pruneLocalBackups();
      return info;
    } finally {
      this.backupRunning = false;
    }
  }

  private storageStatus() {
    const endpoint = optionalConfig(this.config.get<string>("S3_ENDPOINT"));
    const bucket = optionalConfig(this.config.get<string>("S3_BUCKET"));
    const accessKeyId = optionalConfig(this.config.get<string>("S3_ACCESS_KEY_ID"));
    const secretAccessKey = optionalConfig(this.config.get<string>("S3_SECRET_ACCESS_KEY"));
    return {
      provider: "s3-compatible",
      configured: Boolean(endpoint && bucket && accessKeyId && secretAccessKey),
      endpoint: endpoint ?? null,
      endpointHost: endpoint ? safeHost(endpoint) : null,
      region: optionalConfig(this.config.get<string>("S3_REGION")) ?? "us-west-004",
      bucket: bucket ?? null,
      keyPrefix: optionalConfig(this.config.get<string>("S3_KEY_PREFIX")) ?? "erp",
      backupRemotePrefix: this.backupRemotePrefix(),
      forcePathStyle: this.config.get<string>("S3_FORCE_PATH_STYLE", "true") !== "false",
      accessKeyConfigured: Boolean(accessKeyId),
      secretKeyConfigured: Boolean(secretAccessKey),
    };
  }

  private async databaseStats() {
    const [studies, properties, documents, priceLists, drafts] = await Promise.all([
      this.prisma.feasibilityStudy.count(),
      this.prisma.property.count(),
      this.prisma.propertyDocument.count(),
      this.prisma.priceList.count(),
      this.prisma.planAnalysisDraft.count(),
    ]);
    return {
      connected: true,
      studies,
      properties,
      documents,
      priceLists,
      planDrafts: drafts,
    };
  }

  private async latestBackup(): Promise<BackupInfo | null> {
    const backupDir = this.backupDir();
    let entries: string[];
    try {
      entries = await fs.readdir(backupDir);
    } catch {
      return null;
    }
    const backupFiles = entries.filter((entry) => entry.endsWith(".dump"));
    const records = await Promise.all(
      backupFiles.map(async (fileName) => {
        const localPath = path.join(backupDir, fileName);
        const stat = await fs.stat(localPath);
        return {
          fileName,
          localPath,
          stat,
        };
      }),
    );
    const latest = records.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime())[0];
    if (!latest) return null;

    const remoteKey = this.remoteKey(latest.fileName);
    return {
      fileName: latest.fileName,
      localPath: latest.localPath,
      sizeBytes: latest.stat.size,
      createdAt: latest.stat.mtime.toISOString(),
      remoteKey,
      uploaded: await this.remoteObjectExists(remoteKey),
    };
  }

  private runPgDump(localPath: string) {
    const database = parseDatabaseUrl(this.config.get<string>("DATABASE_URL"));
    return new Promise<void>((resolve, reject) => {
      const args = [
        "-h",
        database.host,
        "-p",
        database.port,
        "-U",
        database.user,
        "-d",
        database.database,
        "-Fc",
        "-f",
        localPath,
      ];
      const child = spawn("pg_dump", args, {
        env: {
          ...process.env,
          PGPASSWORD: database.password,
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        reject(new InternalServerErrorException(`pg_dump non disponibile: ${error.message}`));
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new InternalServerErrorException(`Backup PostgreSQL fallito: ${stderr.trim() || `pg_dump exit ${code}`}`));
      });
    });
  }

  private async uploadBackup(localPath: string, remoteKey: string, sizeBytes: number) {
    if (!this.storageStatus().configured) return false;
    await this.client().send(
      new PutObjectCommand({
        Bucket: this.requiredConfig("S3_BUCKET"),
        Key: remoteKey,
        Body: createReadStream(localPath),
        ContentLength: sizeBytes,
        ContentType: "application/octet-stream",
        Metadata: {
          source: "pq-manual-backup",
        },
      }),
    );
    return true;
  }

  private async remoteObjectExists(remoteKey: string) {
    if (!this.storageStatus().configured) return false;
    try {
      await this.client().send(
        new HeadObjectCommand({
          Bucket: this.requiredConfig("S3_BUCKET"),
          Key: remoteKey,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private async pruneLocalBackups() {
    const retentionDays = integerConfig(this.config.get<string>("BACKUP_RETENTION_DAYS"), 14);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const backupDir = this.backupDir();
    const entries = await fs.readdir(backupDir).catch(() => []);
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".dump"))
        .map(async (entry) => {
          const localPath = path.join(backupDir, entry);
          const stat = await fs.stat(localPath);
          if (stat.mtime.getTime() < cutoff) await fs.unlink(localPath);
        }),
    );
  }

  private client() {
    if (this.s3Client) return this.s3Client;
    this.s3Client = new S3Client({
      endpoint: this.requiredConfig("S3_ENDPOINT"),
      region: optionalConfig(this.config.get<string>("S3_REGION")) ?? "us-west-004",
      forcePathStyle: this.config.get<string>("S3_FORCE_PATH_STYLE", "true") !== "false",
      credentials: {
        accessKeyId: this.requiredConfig("S3_ACCESS_KEY_ID"),
        secretAccessKey: this.requiredConfig("S3_SECRET_ACCESS_KEY"),
      },
    });
    return this.s3Client;
  }

  private backupDir() {
    return optionalConfig(this.config.get<string>("BACKUP_DIR")) ?? "/backups/postgres";
  }

  private backupRemotePrefix() {
    return optionalConfig(this.config.get<string>("BACKUP_REMOTE_PREFIX")) ?? "backups/postgres";
  }

  private remoteKey(fileName: string) {
    return `${this.backupRemotePrefix().replace(/\/+$/g, "")}/${fileName}`;
  }

  private databaseName() {
    return parseDatabaseUrl(this.config.get<string>("DATABASE_URL")).database;
  }

  private requiredConfig(name: string) {
    const value = optionalConfig(this.config.get<string>(name));
    if (!value || value.includes("REPLACE_")) throw new InternalServerErrorException(`${name} non configurato`);
    return value;
  }
}

function parseDatabaseUrl(value?: string) {
  const raw = optionalConfig(value);
  if (!raw) throw new InternalServerErrorException("DATABASE_URL non configurato");
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

function optionalConfig(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function integerConfig(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeHost(endpoint: string) {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
