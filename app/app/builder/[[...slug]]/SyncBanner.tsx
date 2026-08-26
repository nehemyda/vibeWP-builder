"use client";

import styles from "./builder.module.css";
import type { PageSyncReport } from "@/app/actions/sync";

/**
 * Surfaces pages where WordPress and VibeWP disagree.
 *
 * Only states a person needs to act on appear here. "vibe_ahead" is normal —
 * it just means there are unpushed changes, which the Export button already
 * conveys — and "in_sync"/"not_exported" need no attention at all.
 *
 * A conflict deliberately offers no default action. Both sides changed since
 * the last sync, so either choice discards someone's work; the point is that a
 * person decides which, rather than the software picking quietly.
 */
export function SyncBanner({
  report,
  busy,
  onPull,
  onResolve,
  onOpenWpAdmin,
  onDismiss,
}: {
  report: PageSyncReport[];
  busy: string | null;
  onPull: (slug: string) => void;
  onResolve: (slug: string, keep: "wordpress" | "vibewp") => void;
  onOpenWpAdmin: () => void;
  onDismiss: () => void;
}) {
  const needsAttention = report.filter(
    (p) => p.state === "wp_ahead" || p.state === "conflict" || p.state === "never_synced",
  );
  if (needsAttention.length === 0) return null;

  return (
    <div className={styles.syncBanner}>
      <div className={styles.syncHead}>
        <strong>
          {needsAttention.length === 1
            ? "1 page differs in WordPress"
            : `${needsAttention.length} pages differ in WordPress`}
        </strong>
        <button type="button" className={styles.syncDismiss} onClick={onDismiss}>
          Dismiss
        </button>
      </div>

      {needsAttention.map((page) => {
        const isConflict = page.state === "conflict" || page.state === "never_synced";
        return (
          <div className={styles.syncRow} key={page.slug}>
            <div className={styles.syncInfo}>
              <span className={styles.syncPage}>{page.title}</span>
              <span className={styles.syncWhy}>{page.description}</span>

              {/* Show what actually differs — a state name alone isn't actionable. */}
              {page.wpHeading !== page.vibeHeading && (
                <span className={styles.syncDiff}>
                  <span>
                    <em>WordPress:</em> {page.wpHeading ?? "—"}
                  </span>
                  <span>
                    <em>VibeWP:</em> {page.vibeHeading ?? "—"}
                  </span>
                </span>
              )}

              {/*
                Blocks we cannot model would be destroyed by a pull, since the
                schema has no way to hold them. Warn rather than discover it
                afterwards.
              */}
              {page.unmodelled.length > 0 && (
                <span className={styles.syncWarn}>
                  Pulling would drop blocks VibeWP can&apos;t represent yet:{" "}
                  {page.unmodelled.join(", ")}
                </span>
              )}
            </div>

            <div className={styles.syncActions}>
              {isConflict ? (
                <>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={busy === page.slug}
                    onClick={() => onResolve(page.slug, "wordpress")}
                  >
                    Keep WordPress
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={busy === page.slug}
                    onClick={() => onResolve(page.slug, "vibewp")}
                  >
                    Keep VibeWP
                  </button>
                  <button type="button" className={styles.btn} onClick={onOpenWpAdmin}>
                    Open in wp-admin
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={busy === page.slug}
                  onClick={() => onPull(page.slug)}
                >
                  {busy === page.slug ? "Pulling…" : "Pull into VibeWP"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
