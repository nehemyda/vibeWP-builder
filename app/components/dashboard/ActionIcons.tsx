/**
 * The icons on row action buttons.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THESE ARE HAND-DRAWN AND NOT A PACKAGE
 *
 * The codebase already draws its icons inline — one 24-unit viewBox, stroked
 * in currentColor, no fill. Adding an icon dependency to put a trash can next
 * to the word "Delete" would ship a library for five glyphs and give this row
 * a different visual grammar from every other icon in the app.
 *
 * currentColor is what matters: .btn sets the colour, so an icon inside a
 * destructive button follows it without anything here knowing that.
 *
 * aria-hidden on all of them, deliberately. Every one sits beside its own
 * label, so announcing it would read the action twice.
 * ─────────────────────────────────────────────────────────────────────
 */

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

/** View — an eye, for looking at a site's record without changing it. */
export function ViewIcon() {
  return (
    <Icon>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/** Dashboard — the panel layout it opens onto. */
export function DashboardIcon() {
  return (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  );
}

/** Restore — an arrow coming back round, which is what undoing a delete is. */
export function RestoreIcon() {
  return (
    <Icon>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </Icon>
  );
}

/** Delete — a bin, for the soft delete that keeps everything. */
export function DeleteIcon() {
  return (
    <Icon>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </Icon>
  );
}

/**
 * Delete permanently — the same bin, struck through.
 *
 * Deliberately a variation rather than a different object: it is the same
 * action taken past the point of return, and giving it an unrelated glyph
 * would hide that the two are related at all.
 */
export function PurgeIcon() {
  return (
    <Icon>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M3 3l18 18" />
    </Icon>
  );
}
