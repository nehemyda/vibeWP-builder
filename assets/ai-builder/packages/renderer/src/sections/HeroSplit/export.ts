import { group, paragraph, heading, list, image, buttons } from "../../gutenberg/blocks";
import type { HeroSplitProps } from "./schema";

/* ============================================================
   HeroSplit — the export serializer

   THE CONTRACT: every class name here is identical to the one in
   index.tsx. That parity is what lets one stylesheet serve both the
   platform render and the exported WordPress site.

   If you add a prop to schema.ts, it must be consumed here too. The
   fidelity test fails on any prop the serializer ignores.
   ============================================================ */

export interface ExportContext {
  /** Resolves a media path to a URL valid on the exported site. */
  mediaUrl: (src: string) => string;
}

const passthrough: ExportContext = { mediaUrl: (s) => s };

export function toGutenberg(p: HeroSplitProps, ctx: ExportContext = passthrough): string {
  const copy = group(
    "yp-hero__copy",
    [
      p.eyebrow ? paragraph(p.eyebrow, "yp-hero__eyebrow") : "",
      heading(p.heading, 1, "yp-hero__heading"),
      paragraph(p.body, "yp-hero__body"),
      list(p.features, "yp-hero__features"),
      buttons(p.actions, "yp-hero__actions"),
    ].join("")
  );

  const badge = p.badge
    ? group(
        "yp-hero__badge",
        group("yp-hero__badge-mark", paragraph(p.badge.mark)) +
          group(
            "yp-hero__badge-text",
            paragraph(p.badge.title, "yp-hero__badge-title") +
              paragraph(p.badge.sub, "yp-hero__badge-sub")
          )
      )
    : "";

  const media = group(
    "yp-hero__media",
    image(ctx.mediaUrl(p.media.src), p.media.alt, "yp-hero__frame") + badge
  );

  const stats = group(
    "yp-hero__stats",
    p.stats
      .map((s) =>
        group(
          "yp-hero__stat",
          paragraph(s.label, "yp-hero__stat-label") +
            paragraph(s.value, "yp-hero__stat-value") +
            paragraph(s.note, "yp-hero__stat-note")
        )
      )
      .join("")
  );

  return group("yp-hero", group("yp-hero__grid", copy + media) + stats, "section");
}
