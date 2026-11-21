import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/auth/config";
import { AuthorizationError, isAppRole } from "@/lib/auth/roles";
import type { VerifiedActor } from "@/lib/auth/types";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes sessions.
        }
      },
    },
  });
}

export async function getVerifiedActor(
  existingClient?: SupabaseClient,
): Promise<VerifiedActor | null> {
  const supabase = existingClient ?? (await createServerSupabaseClient());
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    if (
      error.name === "AuthSessionMissingError" ||
      error.status === 400 ||
      error.status === 401
    ) {
      return null;
    }
    throw new Error("Unable to verify the Supabase session.");
  }

  if (!data.user) {
    return null;
  }

  const { data: userRecord, error: roleError } = await supabase
    .from("users")
    .select("id, display_name, role, active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (roleError) {
    throw new Error("Unable to load the active role assignment.");
  }

  if (
    !userRecord ||
    userRecord.active !== true ||
    !isAppRole(userRecord.role)
  ) {
    throw new AuthorizationError(403, "ROLE_FORBIDDEN");
  }

  return {
    id: userRecord.id,
    displayName: userRecord.display_name,
    role: userRecord.role,
  };
}

export async function requireVerifiedActor(
  existingClient?: SupabaseClient,
): Promise<VerifiedActor> {
  const actor = await getVerifiedActor(existingClient);
  if (!actor) {
    throw new AuthorizationError(401, "UNAUTHENTICATED");
  }
  return actor;
}
