"use client";

import { useState } from "react";
import type { WpEditLock } from "@/lib/wp/local-driver";

/**
 * Shown while someone has the site open in the WordPress editor.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS BLOCKS RATHER THAN WARNS
 *
 * The two editors do not merge. VibeWP holds a page as a schema and writes the
 * whole post body on export; WordPress holds it as block markup and rewrites it
 * on save. Whoever saves second silently discards the other's work — and
 * neither person sees it happen, because each was editing a copy that looked
 * correct the whole time.
 *
 * A banner would leave that outcome available to anyone who kept typing, which
 * is the wrong default when the cost is somebody's lost afternoon. So the
 * builder stops until the lock clears, the same way wp-admin stops a second
 * editor.
 *
 * The message names the person and the page, because "this site is locked" is
 * not actionable — the client's next move is to go and ask that colleague, and
 * they can only do that if they know who it is.
 */
export function WordPressLockNotice({
  locks,
  onRecheck,
  onOverride,
}: {
  locks: WpEditLock[];
  /** Checks WordPress again now, rather than waiting for the next poll. */
  onRecheck: () => Promise<void>;
  /** Dismisses the cover for this session, at the client's own risk. */
  onOverride: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  async function recheck() {
    setChecking(true);
    /*
     * A floor on how briefly the spinner can show.
     *
     * The check often answers in under a tenth of a second, so the button
     * changed and changed back within one frame — indistinguishable from a
     * button that does nothing, which is exactly how it was reported. The delay
     * is for the person, not the request.
     */
    const started = Date.now();
    try {
      await onRecheck();
    } finally {
      const elapsed = Date.now() - started;
      if (elapsed < 450) await new Promise((r) => setTimeout(r, 450 - elapsed));
      setCheckedAt(new Date().toLocaleTimeString());
      setChecking(false);
    }
  }

  if (locks.length === 0) return null;

  // Almost always one. Named individually when not, because "2 people" would
  // send someone asking around the office.
  const who = [...new Set(locks.map((l) => l.userName))];
  const pages = locks.map((l) => l.title || l.slug);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="wp-lock-title"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 95,
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        background: "rgba(16, 20, 28, 0.55)",
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        style={{
          maxWidth: "30rem",
          background: "var(--surface, #fff)",
          borderRadius: 16,
          border: "1px solid var(--line, #dbdee3)",
          boxShadow: "0 30px 70px -30px rgba(10, 14, 25, 0.55)",
          padding: "1.6rem 1.7rem",
        }}
      >
        <h2
          id="wp-lock-title"
          style={{ margin: "0 0 0.6rem", fontSize: "1.15rem", fontWeight: 700 }}
        >
          {who.length === 1 ? `${who[0]} is editing in WordPress` : "This site is open in WordPress"}
        </h2>

        <p style={{ margin: "0 0 0.9rem", lineHeight: 1.55, color: "var(--ink-2, #4a5160)" }}>
          {who.length === 1 ? who[0] : who.join(" and ")} currently{" "}
          {who.length === 1 ? "has" : "have"} {pages.length === 1 ? "" : "these pages"}
          {pages.length === 1 ? <strong>{pages[0]}</strong> : <strong>{pages.join(", ")}</strong>}{" "}
          open in the WordPress editor.
        </p>

        <p style={{ margin: "0 0 1.1rem", lineHeight: 1.55, color: "var(--ink-2, #4a5160)" }}>
          Editing here at the same time would mean whoever saves last wipes out the
          other&rsquo;s changes, so the builder is paused until they close it.
        </p>

        {/*
          Says plainly that the wait outlasts leaving the editor.

          The previous wording — "checking every 20 seconds" — was true and
          useless: it described our polling and implied the cover would lift
          twenty seconds after someone stepped away. WordPress does not release
          a lock on exit, it expires it after about two and a half minutes, so
          the honest thing to report is the window rather than our timer.
        */}
        <p style={{ margin: "0 0 1.1rem", lineHeight: 1.55, color: "var(--ink-2, #4a5160)" }}>
          WordPress keeps a page reserved for about two and a half minutes after
          the editor is closed, so this can stay up for a short while after they
          have finished. It clears itself.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void recheck()}
            disabled={checking}
            style={{
              padding: "0.5rem 0.95rem",
              borderRadius: 9,
              border: "1px solid var(--line, #dbdee3)",
              background: "transparent",
              font: "inherit",
              fontSize: "0.88rem",
              cursor: checking ? "default" : "pointer",
              opacity: checking ? 0.65 : 1,
            }}
          >
            {checking ? "Checking WordPress…" : "Check again now"}
          </button>

          {/*
            The time of the last check, so this is diagnosable from the screen.
            If someone reports the cover stuck, the question is whether checks
            are running at all — a timestamp that never advances answers it, and
            "it still says locked" does not.
          */}
          {checkedAt && !checking && (
            <span style={{ fontSize: "0.82rem", color: "var(--muted, #79808f)" }}>
              Checked at {checkedAt} — still open in WordPress.
            </span>
          )}
        </div>

        {/*
          An escape hatch, because being wrong in the blocking direction is not
          free. Everything above depends on our lock reading being right; if it
          is not, the cost is a client locked out of their own builder with no
          way back but a reload that changes nothing. wp-admin offers the same
          way past its own lock screen.
        */}
        <p style={{ margin: "1.1rem 0 0", fontSize: "0.82rem", color: "var(--muted, #79808f)" }}>
          Sure nobody is in the WordPress editor?{" "}
          <button
            type="button"
            onClick={onOverride}
            style={{
              padding: 0,
              border: 0,
              background: "none",
              font: "inherit",
              color: "inherit",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Carry on editing anyway
          </button>
          {" "}— your changes will overwrite theirs if they are.
        </p>
      </div>
    </div>
  );
}
