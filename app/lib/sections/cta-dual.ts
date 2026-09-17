import { group, heading, paragraph, buttons } from "@/lib/wp/blocks";
import { text, type Action } from "./shared";
import type { SectionDefinition } from "./types";

export type CtaDualProps = {
  heading?: string;
  options?: Array<{ title: string; body: string; actions?: Action[] }>;
  /** A soft colour wash behind the section. "none" is the design's own background. */
  background?: string;
  /** "contained" matches the rest of the page; "full" stretches the row edge to edge. */
  layout?: string;
};

/**
 * Two side-by-side paths, each with its own button.
 *
 * For businesses with two genuinely different entry points — buy now versus get
 * a quote, book online versus ring. Offering both as equal choices beats
 * guessing which one the visitor wants and burying the other.
 *
 * The nested case: each option carries its own action list.
 */
export const CtaDual: SectionDefinition<CtaDualProps> = {
  key: "cta-dual",
  nodeType: "CtaDual",
  name: "CTA, two paths",
  category: "Conversion",
  description: "Two side-by-side choices with their own buttons. For when there are genuinely two ways in.",
  rootClass: "yp-ctadual",
  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 55 },
    options: { type: "list", label: "Paths", hint: "Exactly two", of: { title: { type: "text", label: "Path name" }, body: { type: "text", label: "Who it's for" }, actions: {
        type: "list",
        label: "Its button",
        of: {
          label: { type: "text", label: "Label" },
          href: { type: "link", label: "Links to" },
        },
      } } },
    /*
     * Declared per-section, not merged into every section — see the note on
     * hero-split.ts. Works here for the identical structural reason:
     * .yp-ctadual__inner already wraps everything under the root, heading
     * included, with nothing else emitted alongside it.
     */
    background: {
      type: "choice",
      label: "Background",
      hint: "A soft colour wash behind this section. The heading and paths stay the same width.",
      choices: ["none", "tint"],
      default: "none",
    },
    layout: {
      type: "choice",
      label: "Width",
      hint: "Full stretches this section edge to edge; the background already does, so this is about the heading and paths.",
      choices: ["contained", "full"],
      default: "contained",
    },
  },
  aiPrompt: "Exactly two paths, genuinely different — not the same action worded twice. Each says WHO it is for, so the visitor can self-select in one read.",
  sample: {
    heading: "Two ways to start",
    options: [
      { title: "Know what you want", body: "Order a bouquet or set up a subscription in a couple of minutes.", actions: [{ label: "Order now", href: "#", variant: "primary" }] },
      { title: "Planning something bigger", body: "Weddings and events start with a free consultation in the shop.", actions: [{ label: "Book a consultation", href: "#", variant: "outline" }] },
    ],
  },
  toGutenberg(p) {
    const opts = (p.options ?? []).filter((o) => o?.title || o?.body).map((o) =>
      group("yp-ctadual__option", [
        o.title ? heading(o.title, 3, "yp-ctadual__title") : "",
        o.body ? paragraph(o.body, "yp-ctadual__body") : "",
        o.actions?.length ? buttons(o.actions, "yp-ctadual__actions") : "",
      ].filter(Boolean).join(""))).join("");
    const rootClass = [
      "yp-ctadual",
      p.background === "tint" ? "u-bg--tint" : "",
      p.layout === "full" ? "u-row--full" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return group(rootClass, group("yp-ctadual__inner", (p.heading ? heading(p.heading, 2, "yp-ctadual__heading") : "") + group("yp-ctadual__grid", opts)), "section");
  },
  fromGutenberg(root) {
    const el = root.querySelector(".yp-ctadual");
    if (!el) return null;
    const elClass = el.getAttribute("class") ?? "";
    return {
      background: elClass.includes("u-bg--tint") ? "tint" : "none",
      layout: elClass.includes("u-row--full") ? "full" : "contained",
      heading: text(el.querySelector(".yp-ctadual__heading")),
      options: el.querySelectorAll(".yp-ctadual__option").map((o) => {
        const acts: Action[] = [];
        for (const btn of o.querySelectorAll(".wp-block-button")) {
          const a = btn.querySelector("a");
          const label = text(a);
          if (!label) continue;
          const cls = btn.getAttribute("class") ?? "";
          acts.push({ label, href: a?.getAttribute("href")?.trim() || "#", variant: cls.includes("yp-btn--outline") ? "outline" : "primary" });
        }
        return { title: text(o.querySelector(".yp-ctadual__title")), body: text(o.querySelector(".yp-ctadual__body")), actions: acts };
      }).filter((o) => o.title || o.body),
    };
  },
};
