import Link from "next/link";
import styles from "./page.module.css";
import { startBuildingAction } from "./actions/sites";

export default function LandingPage() {
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
            <a className={styles.btnGhost} href="/login">
              Log in
            </a>
            <a className={styles.btnSolid} href="/register">
              Get started
            </a>
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
