import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { ErpSyncService } from "./erp-sync.service.js";
import { sanitizeErpAudit } from "./erp-audit-sanitize.js";

const DAY = 86400000;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type AuditEntry = {
  id: string; createdAt: string; expiresAt: string; method: string; path: string; authorized: boolean;
  state: "received" | "completed" | "connection_closed"; statusCode?: number; durationMs?: number;
  requestBytes?: number; requestSha256?: string; responseBytes?: number;
  query?: unknown; requestBody?: unknown; requestTruncated?: boolean; responseBody?: unknown; responseTruncated?: boolean;
  syncIdErp?: string; syncIdPq?: string; studyIds?: string[];
};

@Injectable()
export class ErpAuditService implements OnModuleInit, OnModuleDestroy {
  private readonly directory: string;
  private readonly maxBytes: number;
  private readonly active = new WeakMap<Request, AuditEntry>();
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private sizes = new Map<string, number>();
  private lastFailureAt?: string;
  private failures = 0;
  private lastWarningMs = 0;
  private ready = false;

  constructor(config: ConfigService, private readonly erp: ErpSyncService) {
    this.directory = config.get<string>("ERP_AUDIT_DIR", "/var/lib/soul-pq/erp-audit");
    this.maxBytes = 256 * 1024 * 1024;
  }

  async onModuleInit() {
    try {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      await fs.chmod(this.directory, 0o700);
      await this.cleanup(); this.ready = true;
    } catch { this.failure("initialization"); }
    this.timer = setInterval(() => { void this.enqueue(async () => {
      try { await this.cleanup(); this.ready = true; } catch { this.failure("cleanup"); }
    }); }, 15 * 60 * 1000);
    this.timer.unref();
  }
  async onModuleDestroy() { clearInterval(this.timer); await this.queue; }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work); this.queue = next.catch(() => {}); return next;
  }
  private failure(operation: string) {
    this.failures++; this.lastFailureAt = new Date().toISOString();
    // Never print payloads, filesystem errors (possibly containing data), or credentials.
    if (Date.now() - this.lastWarningMs > 60000) {
      this.lastWarningMs = Date.now();
      console.error(JSON.stringify({ event: "erp_audit_unavailable", operation, failures: this.failures }));
    }
  }
  private sanitize(value: unknown) {
    return sanitizeErpAudit(value, [process.env.ERP_SYNC_TOKEN ?? ""]);
  }

  track = (request: Request, response: Response, next: NextFunction) => {
    if (!/^\/api\/integrations\/erp\/v1(?:\/|$)/i.test(request.path) || request.method === "OPTIONS") return next();
    const start = performance.now(), now = new Date();
    let authorized = false;
    try { this.erp.assertAuthorized(request.headers.authorization); authorized = true; } catch { /* Metadata only. */ }
    const entry: AuditEntry = { id: randomUUID(), createdAt: now.toISOString(), expiresAt: new Date(+now + 10 * DAY).toISOString(),
      method: request.method, path: String(this.sanitize(request.path).body).slice(0, 400), authorized, state: "received" };
    this.active.set(request, entry);
    response.setHeader("X-PQ-Request-Id", entry.id);
    const originalJson = response.json;
    response.json = (body: unknown) => {
      if (authorized && entry.requestBody !== undefined) {
        const sanitized = this.sanitize(body);
        entry.responseBody = sanitized.body; entry.responseTruncated = sanitized.truncated;
        if (body && typeof body === "object" && typeof (body as any).sync_id_pq === "string")
          entry.syncIdPq = String((sanitized.body as any)?.sync_id_pq ?? "").slice(0, 200);
      }
      return originalJson.call(response, body);
    };
    let finished = false;
    const complete = (state: AuditEntry["state"]) => {
      if (finished) return; finished = true;
      entry.state = state; entry.statusCode = response.statusCode; entry.durationMs = Math.round(performance.now() - start);
      const size = Number(response.getHeader("content-length"));
      if (Number.isFinite(size)) entry.responseBytes = size;
      void this.persist(entry);
    };
    response.once("finish", () => complete("completed"));
    response.once("close", () => complete("connection_closed"));
    void this.persist(entry).then(saved => {
      if (!saved && !response.headersSent) response.setHeader("X-PQ-Audit-Status", "unavailable");
      next();
    });
  };

  recordRaw = (request: Request, _response: Response, buffer: Buffer) => {
    const entry = this.active.get(request);
    if (!entry) return;
    entry.requestBytes = buffer.length;
    if (entry.authorized) entry.requestSha256 = createHash("sha256").update(buffer).digest("hex");
  };

  capture = (request: Request, response: Response, next: NextFunction) => {
    const entry = this.active.get(request);
    if (!entry || !entry.authorized) return next();
    const sanitized = this.sanitize(request.body ?? null);
    entry.requestBody = sanitized.body; entry.requestTruncated = sanitized.truncated;
    entry.query = this.sanitize(request.query).body;
    const body = sanitized.body as any;
    if (typeof body?.sync_id_erp === "string") entry.syncIdErp = body.sync_id_erp.slice(0, 200);
    if (Array.isArray(body?.studi)) entry.studyIds = body.studi.slice(0, 1000)
      .map((study: any) => study?.studio_erp_id).filter((id: unknown) => typeof id === "string" || typeof id === "number").map(String);
    void this.persist(entry).then(saved => {
      if (!saved && !response.headersSent) response.setHeader("X-PQ-Audit-Status", "unavailable");
      next();
    });
  };

  private persist(entry: AuditEntry) {
    let json = JSON.stringify(entry);
    if (Buffer.byteLength(json) > 2300 * 1024) {
      json = JSON.stringify({ ...entry, requestBody: "[SIZE_LIMIT]", responseBody: "[SIZE_LIMIT]", requestTruncated: true, responseTruncated: true });
    }
    return this.enqueue(async () => {
      const target = path.join(this.directory, `${entry.id}.json`), temporary = `${target}.part`;
      try {
        if (!this.ready) throw new Error();
        const used = [...this.sizes.values()].reduce((sum, bytes) => sum + bytes, 0);
        const size = Buffer.byteLength(json), previous = this.sizes.get(entry.id) ?? 0;
        const disk = await fs.statfs(this.directory);
        if ((!previous && this.sizes.size >= 10000) || used - previous + size > this.maxBytes || disk.bavail * disk.bsize < 256 * 1024 * 1024) throw new Error();
        await fs.writeFile(temporary, json, { mode: 0o600 });
        await fs.rename(temporary, target); this.sizes.set(entry.id, size);
        return true;
      } catch {
        await fs.unlink(temporary).catch(() => {}); this.failure("write"); return false;
      }
    });
  }

  private async cleanup() {
    const sizes = new Map<string, number>();
    for (const file of await fs.readdir(this.directory)) {
      const id = file.replace(/\.json(?:\.part)?$/, "");
      if (!ID.test(id) || !/\.json(?:\.part)?$/.test(file)) continue;
      const full = path.join(this.directory, file);
      if (file.endsWith(".part")) { await fs.unlink(full); continue; }
      const stat = await fs.stat(full);
      // Requests last minutes, not days; mtime bounds any unreadable/incomplete record too.
      if (stat.mtimeMs < Date.now() - 10 * DAY) { await fs.unlink(full); continue; }
      let entry: AuditEntry | undefined;
      try { entry = JSON.parse(await fs.readFile(full, "utf8")); } catch { /* Count unreadable files, then expire by mtime. */ }
      if (entry && Date.parse(entry.expiresAt) <= Date.now()) { await fs.unlink(full); continue; }
      sizes.set(id, stat.size);
    }
    this.sizes = sizes;
  }

  async list(studyId?: string, syncId?: string, limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (studyId?.length ?? 0) > 200 || (syncId?.length ?? 0) > 200)
      throw new BadRequestException("Filtri log non validi (limit: 1–100)");
    const rows: AuditEntry[] = [];
    for (const file of await fs.readdir(this.directory).catch(() => [] as string[])) {
      const id = file.replace(/\.json$/, ""); if (!ID.test(id) || !file.endsWith(".json")) continue;
      const entry = await this.read(id); if (!entry) continue;
      if (studyId && !entry.studyIds?.includes(studyId)) continue;
      if (syncId && entry.syncIdErp !== syncId && entry.syncIdPq !== syncId) continue;
      const { requestBody, responseBody, query, ...summary } = entry; rows.push(summary);
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { retentionDays: 10, total: rows.length, logs: rows.slice(0, limit),
      storage: { ready: this.ready, bytes: [...this.sizes.values()].reduce((sum, bytes) => sum + bytes, 0), maxBytes: this.maxBytes, failures: this.failures, lastFailureAt: this.lastFailureAt ?? null } };
  }
  private async read(id: string): Promise<AuditEntry | null> {
    try { const entry = JSON.parse(await fs.readFile(path.join(this.directory, `${id}.json`), "utf8"));
      return Date.parse(entry.expiresAt) > Date.now() ? entry : null;
    } catch { return null; }
  }
  async get(id: string) {
    if (!ID.test(id)) throw new BadRequestException("ID richiesta non valido");
    const entry = await this.read(id); if (!entry) throw new NotFoundException("Log non trovato o scaduto"); return entry;
  }
}
