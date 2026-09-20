"use client";

import { useEffect } from "react";
import styles from "./builder.module.css";

/**
 * The site dashboard: one full-width overlay with a rail of tabs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT BELONGS HERE, AND WHAT MUST NOT
 *
 * Everything in here is about the SITE or a PAGE — the type scale, the image
 * library, the meta tags. None of it needs the canvas visible to judge, which
 * is exactly why it can afford to cover the canvas.
 *
 * Section and element styling deliberately stays where it is, on the canvas.
 * You cannot judge a heading size or a width step with the page hidden behind
 * a dialog, and a control whose effect you cannot see is a control you have to
 * guess at. The reference editor draws the same line: its project dashboard
 * holds SEO and settings, while element styling is a panel beside the page.
 *
 * WHY IT NEVER TOUCHES THE IFRAME
 *
 * Opening and closing is parent state and nothing else. The canvas keeps its
 * document, its scroll position and its caret. Rebuilding srcDoc to show a
 * dialog would throw all three away — the same fault that made typing reload
 * the page, and the reason that is worth restating here is that this component
 * is the most tempting place to reintroduce it.
 *
 * WHY THE TAB IS IN THE URL
 *
 * So it survives a reload, so a link can point at it, and so it can be opened
 * directly for verification rather than by clicking through a login.
 * ─────────────────────────────────────────────────────────────────────
 */

export type DashboardTab = "style" | "images" | "seo";

export const DASHBOARD_TABS: Array<{ key: DashboardTab; label: string; hint: string }> = [
  { key: "style", label: "Style", hint: "Type, spacing, corners and colour for the whole site" },
  {
    /*
     * One tab, not two. There was an "Alt text" tab beside this one listing the
     * same photographs from the other end — the library shows FILES, that
     * showed PLACEMENTS. A real distinction, and as two screens it read as the
     * same thumbnails twice, because it was.
     */
    key: "images",
    label: "Images",
    hint: "Everything on your pages, and anything uploaded but unused",
  },
  { key: "seo", label: "SEO", hint: "Titles and descriptions for each page" },
];

export function SiteDashboard({
  tab,
  onTab,
  onClose,
  onBusinessDetails,
  siteName,
  children,
}: {
  tab: DashboardTab;
  onTab: (tab: DashboardTab) => void;
  onClose: () => void;
  /**
   * Opens the business-details form, from the same rail as the tabs.
   *
   * Not a tab, because it cannot be one: the intake form is a full-screen
   * overlay with its own steps and footer, and rendering it inside this pane
   * would put a dialog inside a dialog. But it IS the fourth thing a client
   * reaches for alongside style, images and SEO — the toolbar used to hold
   * four separate buttons for the four of them, opening two different
   * surfaces that looked like one. One button opens this; the rail lists all
   * four; this entry launches the form over the top.
   */
  onBusinessDetails?: () => void;
  siteName: string;
  /** The active tab's content, rendered by the caller. */
  children: React.ReactNode;
}) {
  /*
   * Escape closes it. Bound on the document rather than the dialog, because
   * focus may legitimately be inside a text field in the SEO table and a
   * keydown there does not reach an ancestor that never had focus.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.dashScrim} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.dashShell}
        role="dialog"
        aria-modal="true"
        aria-label={`${siteName} settings`}
        // The scrim closes; the panel must not, or every click inside it would.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className={styles.dashHead}>
          <span className={styles.dashEyebrow}>Site dashboard</span>
          <strong className={styles.dashSite}>{siteName}</strong>
          <button
            type="button"
            className={styles.dashClose}
            onClick={onClose}
            aria-label="Close the dashboard"
          >
            ✕
          </button>
        </header>

        <div className={styles.dashBody}>
          <nav className={styles.dashRail} aria-label="Settings sections">
            {DASHBOARD_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`${styles.dashTab} ${t.key === tab ? styles.dashTabOn : ""}`}
                aria-current={t.key === tab ? "page" : undefined}
                title={t.hint}
                onClick={() => onTab(t.key)}
              >
                {t.label}
              </button>
            ))}
            {onBusinessDetails && (
              <button
                type="button"
                className={`${styles.dashTab} ${styles.dashLauncher}`}
                title="Business name, contact details, services and colours"
                onClick={onBusinessDetails}
              >
                Business details…
              </button>
            )}
          </nav>

          {/*
            The pane scrolls, not the dialog. min-height: 0 on it is what lets
            a flex child shrink below its content — without it the whole
            dialog grows and the rail scrolls off the top.
          */}
          <div className={styles.dashPane}>{children}</div>
        </div>
      </section>
    </div>
  );
}
