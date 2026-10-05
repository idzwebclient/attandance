import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Branch, Profile, Role } from "./types";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { supabase, profile: null, email: null, branch: null };
  // One round trip for the profile and its branch.
  const { data } = await supabase
    .from("profiles")
    .select("*, branch:branches(*)")
    .eq("auth_user_id", userId)
    .maybeSingle<Profile & { branch: Branch | null }>();
  const { branch = null, ...profile } = data ?? {};
  return {
    supabase,
    profile: data ? (profile as Profile) : null,
    email: (claims?.claims?.email as string | undefined) ?? null,
    branch,
  };
});

export function homeFor(role: Role) {
  return role === "admin" ? "/admin" : role === "manager" ? "/manager" : "/attendance";
}

// Use at the top of every protected page and server action.
export async function requireRole(...roles: Role[]) {
  const session = await getSession();
  if (!session.profile) redirect("/login?error=no-profile");
  if (!session.profile.is_active) redirect("/login?error=inactive");
  if (roles.length && !roles.includes(session.profile.role)) redirect(homeFor(session.profile.role));
  return session as typeof session & { profile: Profile };
}
