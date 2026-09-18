import Link from "next/link";
import { eq } from "drizzle-orm";
import styles from "./page.module.css";
import { startBuildingAction } from "./actions/sites";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { roleHomePath } from "@/lib/role-redirect";

export default async function LandingPage() {
  /*
   * The nav has to know whether anyone is signed in.
   *
   * It used to offer "Log in" and "Get started" unconditionally, so a signed-in
   * client reading the marketing page was invited to sign in again — and while
   * an admin was impersonating someone, the page argued with the banner
   * directly above it, which said whose account they were in.
   *
   * Impersonation swaps the session rather than tagging it, so getUser() is
   * already the impersonated person and roleHomePath sends them where THEY
   * belong. Nothing here has to know impersonation exists.
   *
   * The prompt box below was always session-aware — startBuildingAction either
   * starts a draft or bounces to /register. This is the rest of that.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const home = user
    ? roleHomePath(
        (await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) }))?.role ?? "smb_owner",
      )
    : null;

  return (
    <>
      <div className={styles.mesh} />

      <div className={styles.page}>
        <nav className={styles.nav}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark} />
            VibeWP
          </Link>
          <div className={styles.navLinks}>
            <a href="#">Solutions</a>
            <a href="#">Templates</a>
            <a href="#">Agencies</a>
            <a href="#">Pricing</a>
          </div>
          <div className={styles.navActions}>
            {home ? (
              <a className={styles.btnSolid} href={home}>
                Go to dashboard
              </a>
            ) : (
              <>
                <a className={styles.btnGhost} href="/login">
                  Log in
                </a>
                <a className={styles.btnSolid} href="/register">
                  Get started
                </a>
              </>
            )}
          </div>
        </nav>

        <div className={styles.hero}>
          <div className={styles.eyebrow}>
            ✦ Now generating exportable WordPress sites
          </div>
          <h1>Build something ownable</h1>
          <p className={styles.sub}>
            Real WordPress sites your clients can edit forever — never a
            locked-in export.
          </p>

          <form className={styles.promptForm} action={startBuildingAction}>
            <input
              className={styles.promptInput}
              type="text"
              name="prompt"
              placeholder="Ask VibeWP to build a site for my…"
              required
              autoComplete="off"
            />
            <div className={styles.promptRow}>
              <div className={styles.promptLeft}>
                <div className={styles.iconBtn}>+</div>
              </div>
              <div className={styles.promptLeft}>
                <div className={styles.modePill}>Build ▾</div>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Voice input"
                >
                  🎙
                </button>
                <button
                  type="submit"
                  className={`${styles.iconBtn} ${styles.submit}`}
                  aria-label="Start building"
                >
                  →
                </button>
              </div>
            </div>
          </form>

          <div className={styles.trust}>
            Exports to real WordPress · No lock-in · Editable in Gutenberg
          </div>
        </div>
      </div>
    </>
  );
}
