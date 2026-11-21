import type { AppRole } from "@/lib/auth/types";

export const APP_ROLES = [
  "citizen",
  "helper",
  "officer",
  "admin",
  "auditor",
] as const satisfies readonly AppRole[];

export const ROLE_DASHBOARD_COPY: Record<AppRole, string> = {
  citizen:
    "Your personal demo workspace is ready. Claim and profile features are not part of this foundation slice.",
  helper:
    "Assisted workflows will require explicit, family-specific permission before any private record can be accessed.",
  officer:
    "Officer review tools will require an assigned case and current platform consent before they are available.",
  admin:
    "Administrative tools will be limited to versioned synthetic policy management; this slice grants no private-record access.",
  auditor:
    "Auditor tools will provide redacted trace views only. Case data and credentials are not exposed here.",
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.some((role) => role === value);
}

export class AuthorizationError extends Error {
  constructor(
    public readonly statusCode: 401 | 403,
    public readonly code: "UNAUTHENTICATED" | "ROLE_FORBIDDEN",
  ) {
    super(code);
    this.name = "AuthorizationError";
  }
}

export function requireRole(actorRole: AppRole, allowedRoles: readonly AppRole[]) {
  if (!allowedRoles.includes(actorRole)) {
    throw new AuthorizationError(403, "ROLE_FORBIDDEN");
  }
}
