import { HttpException } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest, PqIdentity } from "./auth/auth.policy.js";

export function securityHeaders(_request: Request, response: Response, next: NextFunction) {
  response.removeHeader("X-Powered-By");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Cache-Control", "private, no-store");
  next();
}

// Authorize writes BEFORE accepting/decoding a potentially large JSON/base64
// body. The global guard still enforces endpoint roles after the body is parsed.
export function authorizeBeforeBody(authenticate: (request: Request) => Promise<PqIdentity>,
  authorizeErp: (authorization?: string) => void) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
    try {
      if (/^\/api\/integrations\/erp\/v1(?:\/|$)/i.test(request.path)) authorizeErp(request.headers.authorization);
      else (request as AuthenticatedRequest).pqUser = await authenticate(request);
      next();
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 503;
      const message = error instanceof HttpException ? error.message : "Verifica accesso non disponibile";
      response.status(status).json({ statusCode: status, message });
    }
  };
}
