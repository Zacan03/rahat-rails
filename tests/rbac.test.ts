import { describe, expect, it } from "vitest";
import demoRoles from "@/tests/fixtures/demo-roles.json";
import {
  APP_ROLES,
  AuthorizationError,
  isAppRole,
  requireRole,
} from "@/lib/auth/roles";

describe("Slice A role authorization", () => {
  it("provides synthetic fixtures for all five database roles", () => {
    expect(demoRoles.map(({ role }) => role)).toEqual([...APP_ROLES]);
    expect(demoRoles.every(({ email }) => email.endsWith(".test"))).toBe(true);
  });

  it("accepts only known role values", () => {
    expect(isAppRole("auditor")).toBe(true);
    expect(isAppRole("superuser")).toBe(false);
    expect(isAppRole(undefined)).toBe(false);
  });

  it("denies a role not explicitly allowed", () => {
    expect(() => requireRole("citizen", ["officer"])).toThrow(
      new AuthorizationError(403, "ROLE_FORBIDDEN"),
    );
    expect(() => requireRole("officer", ["officer"])).not.toThrow();
  });
});
