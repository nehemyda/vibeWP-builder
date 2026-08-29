import { group, siteTitle, heading, paragraph } from "@/lib/wp/blocks";
import { text , copyrightLine, parseCopyrightName } from "./shared";
import type { SectionDefinition } from "./types";

export type FooterColumnsProps = { blurb?: string; columns?: Array<{ title: string; links?: Array<{ label: string; href?: string }> }>; copyright?: string };

/**
 * Brand and blurb beside two or three link columns.
 *
 * The links are plain text with optional hrefs rather than a WordPress
 * navigation block, because footer link groups are rarely the same as the main
 * menu — a footer lists pages, policies and services that would clutter the
 * header.
 */
export const FooterColumns: SectionDefinition<FooterColumnsProps> = {
  key: "footer-columns",
  nodeType: "FooterColumns",
  name: "Footer, link columns",
  category: "Footer",
  placement: "footer",
  description: "Brand and blurb beside link columns. Footer links are usually not the main menu — pages, policies, services.",
  rootClass: "yp-ftrc",
  fields: {
    blurb: { type: "text", label: "Blurb under the brand", maxChars: 150 },
    columns: { type: "list", label: "Columns", hint: "Two or three", of: { title: { type: "text", label: "Column heading" }, links: { type: "text", label: "Links in it" } } },
    copyright: { type: "text", label: "Copyright name", hint: "Name only — the year is added for you" },
  },
  aiPrompt: "Group links by what a visitor is looking for — Services, About, Legal. Two or three columns, three or four links each. Only link to pages that plausibly exist; leave hrefs empty otherwise.",
  sample: {
    blurb: "Seasonal flowers, arranged by hand on Market Street since 2011.",
    columns: [
      { title: "What we do", links: [{ label: "Weddings" }, { label: "Subscriptions" }, { label: "Sympathy" }, { label: "Events" }] },
      { title: "The shop", links: [{ label: "About us" }, { label: "Opening hours" }, { label: "Find us" }] },
      { title: "Legal", links: [{ label: "Privacy" }, { label: "Terms" }] },
    ],
    copyright: "Bluebell Florist",
  },
  toGutenberg(p) {
    const cols = (p.columns ?? []).filter((c) => c?.title).map((c) =>
      group("yp-ftrc__col",
        heading(c.title, 3, "yp-ftrc__col-title") +
        group("yp-ftrc__links", (c.links ?? []).filter((l) => l?.label).map((l) =>
          l.href
            ? `<!-- wp:paragraph {"className":"yp-ftrc__link"} -->\n<p class="yp-ftrc__link"><a href="${l.href}">${l.label}</a></p>\n<!-- /wp:paragraph -->`
            : paragraph(l.label, "yp-ftrc__link"),
        ).join("")),
      )).join("");

    const brand = group("yp-ftrc__brandcol", siteTitle("yp-ftrc__brand") + (p.blurb ? paragraph(p.blurb, "yp-ftrc__blurb") : ""));
    return group("yp-ftrc", group("yp-ftrc__inner",
      group("yp-ftrc__grid", brand + cols) +
      (p.copyright ? paragraph(copyrightLine(p.copyright), "yp-ftrc__copy") : "")), "div");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ftrc");
    if (!el) return null;
    return {
      blurb: text(el.querySelector(".yp-ftrc__blurb")),
      columns: el.querySelectorAll(".yp-ftrc__col").map((c) => ({
        title: text(c.querySelector(".yp-ftrc__col-title")),
        links: c.querySelectorAll(".yp-ftrc__link").map((l) => ({
          label: l.textContent.trim(),
          ...(l.querySelector("a")?.getAttribute("href") ? { href: l.querySelector("a")!.getAttribute("href")! } : {}),
        })).filter((l) => l.label),
      })).filter((c) => c.title),
      copyright: parseCopyrightName(text(el.querySelector(".yp-ftrc__copy"))),
    };
  },
};
