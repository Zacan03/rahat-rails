"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient, getVerifiedActor } from "@/lib/auth/server";
import { AuthorizationError } from "@/lib/auth/roles";
import demoRoles from "@/tests/fixtures/demo-roles.json";

const LoginSchema = z.object({
  email: z.email().refine((value) => value.toLowerCase().endsWith(".test")),
  password: z.string().min(1).max(256),
});

export async function login(formData: FormData) {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/login?error=credentials");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect("/login?error=credentials");
  }

  let actor;
  try {
    actor = await getVerifiedActor(supabase);
  } catch (verificationError) {
    if (
      !(verificationError instanceof AuthorizationError) ||
      verificationError.statusCode !== 403
    ) {
      throw verificationError;
    }
    await supabase.auth.signOut();
    redirect("/login?error=account");
  }

  if (!actor) {
    await supabase.auth.signOut();
    redirect("/login?error=credentials");
  }

  redirect("/dashboard");
}

/** One-click login for the SYNTHETIC demo accounts. The password never reaches the client. */
export async function demoLogin(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  const demoAccount = demoRoles.find((account) => account.role === role);
  if (!demoAccount) {
    redirect("/login?error=demo-role");
  }

  const password = process.env.DEMO_USER_PASSWORD || "DemoPass123!";
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: demoAccount.email,
    password,
  });
  if (error) {
    redirect("/login?error=demo-login");
  }

  let actor;
  try {
    actor = await getVerifiedActor(supabase);
  } catch (verificationError) {
    if (
      !(verificationError instanceof AuthorizationError) ||
      verificationError.statusCode !== 403
    ) {
      throw verificationError;
    }
    await supabase.auth.signOut();
    redirect("/login?error=demo-account");
  }

  if (!actor || actor.role !== role) {
    await supabase.auth.signOut();
    redirect("/login?error=demo-account");
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error("Unable to end the Supabase session.");
  }

  redirect("/login");
}
