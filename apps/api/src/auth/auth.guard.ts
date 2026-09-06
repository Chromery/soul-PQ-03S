import { Injectable, SetMetadata, ForbiddenException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service.js";
import type { AuthenticatedRequest } from "./auth.policy.js";

// Only health and the separately authenticated ERP controller use this decorator.
export const ExternalAuthentication = () => SetMetadata("pq.externalAuthentication", true);
export const AdminOnly = () => SetMetadata("pq.adminOnly", true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride("pq.externalAuthentication", targets)) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.pqUser = await this.auth.authenticate(request);
    if (this.reflector.getAllAndOverride("pq.adminOnly", targets) && request.pqUser.role !== "admin") {
      throw new ForbiddenException("Operazione riservata agli amministratori");
    }
    return true;
  }
}
