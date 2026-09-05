/**
 * What the client last copied, so it can be pasted somewhere else.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A REFERENCE, NOT A SECTION
 *
 * The obvious clipboard holds the copied section itself — its type and all
 * its props — and paste posts that back. It is also the one design that
 * cannot be made safe: the browser would be handing the server a section of
 * its own devising, which is then written into a page and published to a live
 * WordPress site.
 *
 * So what is stored is WHERE the thing was copied from: a page and a
 * position. Paste sends that, and the server reads the section itself, under
 * the same ownership check as any other write. There is nothing here worth
 * forging — a reference to a page you cannot edit is refused by the same gate
 * that refuses editing it.
 *
 * It also behaves better. Copy a section, change it, then paste: you get what
 * the section is now, not a snapshot from whenever the copy happened. The one
 * case that needs handling is the source disappearing, and the server says so
 * in as many words rather than pasting something stale.
 *
 * WHY sessionStorage
 *
 * A clipboard should outlive moving between pages — "copy and paste some
 * other page's section" is the whole point — and should not outlive the tab.
 * sessionStorage is exactly that. It is also per-tab, so two tabs open on two
 * sites cannot paste into each other by accident.
 *
 * Reads and writes are wrapped: a private window, or a browser set to block
 * site data, throws on access rather than returning nothing.
 * ─────────────────────────────────────────────────────────────────────
 */

/** A copied section, addressed rather than carried. */
export type Clip = {
  /** Which page it was copied from, within the site named below. */
  slug: string;
  index: number;
  /** Scoped to a site so a clip cannot cross between two of them. */
  siteId: string;
  /** What it was, for the menu to say "Paste Services grid". */
  label: string;
  /** Whether it was the whole section or only its settings. */
  kind: "section" | "style";
};

const KEY = "vibewp:clip";

export function readClip(siteId: string): Clip | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const clip = JSON.parse(raw) as Clip;
    // A clip from another site names positions that mean nothing here.
    if (!clip || clip.siteId !== siteId) return null;
    if (typeof clip.index !== "number" || typeof clip.slug !== "string") return null;
    return clip;
  } catch {
    return null;
  }
}

export function writeClip(clip: Clip): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(clip));
  } catch {
    // Nothing to fall back to, and failing to copy must not break the page.
  }
}

export function clearClip(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* as above */
  }
}
