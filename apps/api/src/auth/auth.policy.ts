import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

export type PqRole = "admin" | "operator";
export type PqIdentity = { userId: string; role: PqRole; name: string; firstName: string; lastName: string; jobTitle: string | null; email: string; automation: boolean };
export type AuthenticatedRequest = Request & { pqUser: PqIdentity };

// Business profile is display-only, never a permission grant. Invitation public
// metadata is server-managed; an explicit private profile overrides it.
export function displayProfile(user: { firstName?: string | null; lastName?: string | null;
  privateMetadata: Record<string, unknown>; publicMetadata?: Record<string, unknown> }, email: string) {
  const raw = Object.hasOwn(user.privateMetadata, "pqProfile")
    ? user.privateMetadata.pqProfile : user.publicMetadata?.pqProfile;
  const profile = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const text = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";
  const firstName = text(profile.firstName, 100) || text(user.firstName, 100);
  const lastName = text(profile.lastName, 100) || text(user.lastName, 100);
  return { firstName, lastName, name: [firstName, lastName].filter(Boolean).join(" ") || email,
    jobTitle: text(profile.jobTitle, 160) || null };
}

// Clerk invitation metadata is written only by the Backend API and copied to
// publicMetadata on acceptance. User-editable unsafeMetadata is never consulted.
// An explicit private grant (including a revocation/null) always takes precedence.
export function accessMetadata(privateMetadata: Record<string, unknown>, publicMetadata: Record<string, unknown> = {}) {
  if (Object.hasOwn(privateMetadata, "pq")) return privateMetadata;
  return { pq: publicMetadata.pqInvitation };
}

export function sessionToken(request: Pick<Request, "headers">) {
  const authorization = request.headers.authorization;
  if (authorization !== undefined) {
    if (!authorization.startsWith("Bearer ") || !authorization.slice(7)) throw new UnauthorizedException();
    return authorization.slice(7);
  }
  const values = (request.headers.cookie ?? "").split(";")
    .map((cookie) => cookie.trim()).filter((cookie) => cookie.startsWith("__session="));
  // Ambiguous cookies must not select a session from another subdomain.
  if (values.length !== 1) throw new UnauthorizedException("Accesso richiesto");
  try { return decodeURIComponent(values[0].slice("__session=".length)); }
  catch { throw new UnauthorizedException(); }
}

export function requireTrustedOrigin(request: Pick<Request, "headers" | "method">, origins: string[]) {
  const origin = request.headers.origin;
  if (origin && !origins.includes(origin)) throw new ForbiddenException("Origine non autorizzata");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !origin && !request.headers.authorization) {
    throw new ForbiddenException("Origine richiesta per modifiche tramite sessione browser");
  }
}

export function grantedRole(metadata: Record<string, unknown>, environment: string): { role: PqRole; automation: boolean } {
  const pq = metadata.pq as Record<string, unknown> | undefined;
  if (!pq || pq.environment !== environment || (pq.role !== "admin" && pq.role !== "operator")) {
    throw new ForbiddenException("Il tuo account non è ancora abilitato a PQ. Contatta l’amministratore.");
  }
  const automation = pq.automation === true;
  if (automation && environment !== "staging") throw new ForbiddenException("Account di test non ammesso in produzione");
  return { role: pq.role, automation };
}
