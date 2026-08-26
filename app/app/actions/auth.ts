"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles, agencies } from "@/lib/db/schema";
import { resolveNextPath } from "./sites";
import { generatePartnerId } from "@/lib/ids";
import { logActivity } from "@/lib/activity";

/**
 * Runs right after a client-side supabase.auth.signUp() call that already
 * established a session (cookies are shared between the browser and server
 * Supabase clients via @supabase/ssr, so the user is visible here already).
 * Returns the path to navigate to — the caller does the actual redirect,
 * since next/navigation's redirect() thrown here would just be caught by
 * the calling component's own error handling instead of Next's router.
 */
export async function completeSignup(input: {
  fullName: string;
  agencyName: string;
  prompt: string | null;
}): Promise<{ redirectTo: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No authenticated user after signup.");

  const role = input.agencyName.trim() ? "agency_owner" : "smb_owner";

  await db.insert(profiles).values({
    id: user.id,
    fullName: input.fullName,
    role,
  });

  if (role === "agency_owner") {
    const partnerId = await generatePartnerId();
    await db.insert(agencies).values({
      partnerId,
      name: input.agencyName.trim(),
      ownerUserId: user.id,
    });
  }

  return { redirectTo: await resolveNextPath(user.id, input.prompt) };
}

/** Runs right after a client-side supabase.auth.signInWithPassword() call. */
export async function afterLogin(input: {
  prompt: string | null;
}): Promise<{ redirectTo: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No authenticated user after login.");

  const profile = await db.query.profiles.findFirst({ where: (p, { eq }) => eq(p.id, user.id) });
  await logActivity({
    actorUserId: user.id,
    actorName: profile?.fullName ?? user.email ?? "Unknown",
    action: "auth.login",
    targetType: "user",
    targetId: user.id,
    targetLabel: profile?.fullName ?? user.email ?? null,
  });

  return { redirectTo: await resolveNextPath(user.id, input.prompt) };
}

/** Bound directly to a <form action={signOut}> — a real form action, so redirect() is safe here. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
