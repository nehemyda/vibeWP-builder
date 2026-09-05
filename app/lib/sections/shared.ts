import type { HTMLElement } from "node-html-parser";
import { readRichText } from "@/lib/wp/richtext";

/**
 * Parsing helpers every section needs.
 *
 * Extracted because the button-reading loop had already been written out four
 * times, identically, and five more hero variants would have made nine copies —
 * each a place for the variant handling to quietly drift apart.
 */

export type Action = { label: string; href: string; variant: "primary" | "outline" | "ghost" };

export type SectionImage = {
  url: string;
  alt: string;
  id?: number;
  width?: number;
  height?: number;
};

/**
 * Reads an element's copy back into a prop.
 *
 * Goes through readRichText rather than textContent so a bolded word survives
 * a pull from WordPress — gutenbergToSchema rebuilds every prop from the
 * markup, so anything no parser reads is destroyed. For copy with no markup
 * in it this returns exactly what textContent.trim() did.
 *
 * Links are dropped, because every <a> a section renders is generated from a
 * separate href field rather than stored in the copy. See ReadOptions.
 */
export const text = (el: HTMLElement | null): string => readRichText(el, { links: false });

/** Reads core/button blocks back, recovering the variant from its class. */
export function parseActions(scope: HTMLElement): Action[] {
  const out: Action[] = [];
  for (const btn of scope.querySelectorAll(".wp-block-button")) {
    const anchor = btn.querySelector("a");
    const label = text(anchor);
    if (!label) continue;
    const cls = btn.getAttribute("class") ?? "";
    out.push({
      label,
      href: anchor?.getAttribute("href")?.trim() || "#",
      variant: cls.includes("yp-btn--outline")
        ? "outline"
        : cls.includes("yp-btn--ghost")
          ? "ghost"
          : "primary",
    });
  }
  return out;
}

/**
 * Reads an image back from a frame.
 *
 * `wp-image-<id>` is the attachment link, and it survives editor saves more
 * reliably than the block-attribute JSON does.
 */
export function parseImage(scope: HTMLElement, frameSelector: string): SectionImage | null {
  const img = scope.querySelector(`${frameSelector} img`);
  const url = img?.getAttribute("src")?.trim();
  if (!img || !url) return null;

  const idMatch = img.getAttribute("class")?.match(/wp-image-(\d+)/);
  const width = Number(img.getAttribute("width"));
  const height = Number(img.getAttribute("height"));

  return {
    url,
    alt: img.getAttribute("alt")?.trim() ?? "",
    ...(idMatch ? { id: Number(idMatch[1]) } : {}),
    ...(Number.isFinite(width) && width > 0 ? { width } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height } : {}),
  };
}

/** Reads label/value pairs, e.g. a stats row. */
export function parseStats(
  scope: HTMLElement,
  itemSelector: string,
  valueSelector: string,
  labelSelector: string,
): Array<{ value: string; label: string }> {
  return scope
    .querySelectorAll(itemSelector)
    .map((el) => ({
      value: text(el.querySelector(valueSelector)),
      label: text(el.querySelector(labelSelector)),
    }))
    .filter((s) => s.value || s.label);
}

/**
 * The copyright line: "© {{year}} Business Name".
 *
 * The {{year}} token is substituted at render time by the theme's
 * vibewp_render_year_token filter, so the year is never baked into content —
 * a hard-coded year is wrong every January and goes unnoticed for months.
 *
 * Previews substitute it too, via withPreviewPlaceholders(), so what the
 * library shows matches what the site renders.
 */
export const YEAR_TOKEN = "{{year}}";

export function copyrightLine(businessName: string | undefined): string {
  const name = businessName?.trim();
  return name ? `© ${YEAR_TOKEN} ${name}` : `© ${YEAR_TOKEN}`;
}

/** Reads a name back out of "© 2026 Business Name" or "© {{year}} Business Name". */
export function parseCopyrightName(raw: string): string {
  return raw
    .replace(/^\s*©\s*/, "")
    .replace(/^\s*(?:\{\{year\}\}|\d{4})\s*/, "")
    .trim();
}

/**
 * The root class for a header, with the sticky modifier when it is on.
 *
 * Sticky is ON unless explicitly turned off — a header that scrolls away is the
 * exception people ask for, not the default they expect.
 *
 * IT WILL NOT APPEAR STICKY IN THE BUILDER. The canvas iframe is sized to its
 * content and deliberately does not scroll (the panel around it does), so a
 * sticky element inside has no scrolling ancestor to stick to. It is correct on
 * the exported site; the preview simply cannot demonstrate it.
 */
export function sticky(props: { sticky?: boolean }, rootClass: string): string {
  return props.sticky === false ? rootClass : `${rootClass} is-sticky`;
}

/** Reads the sticky option back out of markup. */
export function parseSticky(el: HTMLElement | null): boolean {
  return (el?.getAttribute("class") ?? "").includes("is-sticky");
}
