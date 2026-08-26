"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

/** Bound to <form action={updateOwnProfileAction}> on /profile. */
export async function updateOwnProfileAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) redirect("/profile");

  await db.update(profiles).set({ fullName }).where(eq(profiles.id, user.id));
  redirect("/profile?saved=1");
}
