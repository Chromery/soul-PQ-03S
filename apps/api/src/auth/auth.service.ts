import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClerkClient, verifyToken, type ClerkClient } from "@clerk/backend";
import type { Request } from "express";
import { grantedRole, requireTrustedOrigin, sessionToken, type PqIdentity } from "./auth.policy.js";

@Injectable()
export class AuthService {
  private client?: ClerkClient;
  private readonly identities = new Map<string, { expires: number; identity: PqIdentity }>();
  constructor(private readonly config: ConfigService) {}

  async authenticate(request: Request): Promise<PqIdentity> {
    const secretKey = this.config.get<string>("CLERK_SECRET_KEY") ?? "";
    const publishableKey = this.config.get<string>("VITE_CLERK_PUBLISHABLE_KEY") ?? "";
    const environment = this.config.get<string>("APP_ENV");
    const origins = (this.config.get<string>("CLERK_AUTHORIZED_PARTIES") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    const keyType = environment === "production" ? "live" : "test";
    if (!["staging", "production"].includes(environment ?? "") || !origins.length ||
        !secretKey.startsWith(`sk_${keyType}_`) || !publishableKey.startsWith(`pk_${keyType}_`)) {
      throw new ServiceUnavailableException("Accesso sicuro in configurazione. Contatta l’amministratore.");
    }
    requireTrustedOrigin(request, origins);
    const token = sessionToken(request);
    let claims;
    try {
      claims = await verifyToken(token, { secretKey, authorizedParties: origins,
        jwtKey: this.config.get<string>("CLERK_JWT_KEY")?.replace(/\\n/g, "\n") });
    } catch { throw new UnauthorizedException("Sessione scaduta o non valida"); }
    const issuer = `https://${Buffer.from(publishableKey.slice(`pk_${keyType}_`.length), "base64").toString().replace(/\$$/, "")}`;
    if (!claims.sub || !claims.sid || !claims.azp || !origins.includes(claims.azp) || claims.iss !== issuer) {
      throw new UnauthorizedException("Sessione non valida per questo ambiente");
    }
    const cached = this.identities.get(claims.sub);
    if (cached && cached.expires > Date.now()) return cached.identity;
    this.client ??= createClerkClient({ secretKey, publishableKey });
    let user;
    try { user = await this.client.users.getUser(claims.sub); }
    catch { throw new ServiceUnavailableException("Verifica account temporaneamente non disponibile"); }
    if (user.banned || user.locked) throw new UnauthorizedException("Account non attivo");
    const grant = grantedRole(user.privateMetadata, environment!);
    const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId && address.verification?.status === "verified")?.emailAddress;
    if (!email) throw new UnauthorizedException("Email verificata richiesta");
    const identity: PqIdentity = { userId: user.id, ...grant, email,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || email };
    // Small bounded cache: role changes and account blocks apply within 15 seconds.
    if (this.identities.size >= 500) this.identities.clear();
    this.identities.set(user.id, { expires: Date.now() + 15_000, identity });
    return identity;
  }
}
