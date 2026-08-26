import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { hasPermission } from "@/lib/permissions";

/**
 * For use inside mutating server actions — confirms the caller is logged in
 * AND their role currently has the given permission per the Roles &
 * Permissions matrix. Deliberately only gates actions (create/edit/delete),
 * not page visibility — role alone still controls which pages render, so an
 * admin can never accidentally lock themselves out of viewing /admin/users
 * /permissions to undo a mistake.
 */
export async function requirePermission(key: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  if (!profile || !(await hasPermission(profile.role, key))) {
    redirect("/dashboard");
  }
  return { user, profile };
}
