import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { readImpersonationSession } from "@/lib/impersonation";
import { stopImpersonationAction } from "@/app/actions/impersonation";
import styles from "./ImpersonationBanner.module.css";

export async function ImpersonationBanner() {
  const backup = await readImpersonationSession();
  if (!backup) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });

  return (
    <div className={styles.banner}>
      <span>
        Viewing as <strong>{profile?.fullName ?? "user"}</strong>
        {profile?.role ? ` (${profile.role})` : ""}
      </span>
      <form action={stopImpersonationAction}>
        {/* Named, because the person returning is not always an admin: an
            agency owner viewing a client goes back to their agency. */}
        <button type="submit" className={styles.btn}>
          {backup.impersonatorName ? `Back to ${backup.impersonatorName}` : "Back to my account"}
        </button>
      </form>
    </div>
  );
}
