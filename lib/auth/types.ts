export type AppRole = "citizen" | "helper" | "officer" | "admin" | "auditor";

export type VerifiedActor = {
  id: string;
  displayName: string;
  role: AppRole;
};
