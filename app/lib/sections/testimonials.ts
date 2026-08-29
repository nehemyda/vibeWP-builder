import type { HTMLElement } from "node-html-parser";
import { group, heading, quote } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type TestimonialsProps = {
  heading?: string;
  items?: Array<{ quote: string; name: string; role?: string }>;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

export const Testimonials: SectionDefinition<TestimonialsProps> = {
  key: "testimonials",
  nodeType: "Testimonials",
  name: "Testimonials",
  category: "Social proof",
  description:
    "Two or three customer quotes with attribution. The section that makes the claims above it believable.",
  rootClass: "yp-quotes",

  fields: {
    heading: { type: "text", label: "Section heading", maxChars: 60 },
    items: {
      type: "list",
      label: "Quotes",
      hint: "Two or three. More reads as filler.",
      of: {
        quote: { type: "text", label: "What they said" },
        name: { type: "text", label: "Who said it" },
        role: { type: "text", label: "Their role or location" },
      },
    },
  },

  /*
   * The prompt is unusually strict because a fabricated testimonial is not a
   * quality problem, it is a false statement attributed to a named person. The
   * generator produces clearly-marked placeholders instead, for the client to
   * replace with real ones.
   */
  aiPrompt:
    "Write two or three PLACEHOLDER testimonials for the client to replace with real ones. " +
    "Use plainly generic attributions such as “Customer name” or “Local client” — never invent a " +
    "real-sounding full name, business or location, because these read as genuine endorsements " +
    "once published. Keep each to one or two sentences about a specific outcome.",

  sample: {
    heading: "What our customers say",
    items: [
      {
        quote:
          "They took a vague idea and a colour swatch and turned it into the best part of our day. Everyone asked who did the flowers.",
        name: "Customer name",
        role: "Wedding, Bath",
      },
      {
        quote: "The weekly delivery is the thing I look forward to most. Always something different, always fresh.",
        name: "Customer name",
        role: "Subscription client",
      },
    ],
  },

  toGutenberg(p) {
    const items = (p.items ?? [])
      .filter((i) => i?.quote)
      .map((i) => {
        const attribution = [i.name, i.role].filter(Boolean).join(" · ");
        return quote(i.quote, attribution, "yp-quotes__item");
      })
      .join("");

    return group(
      "yp-quotes",
      (p.heading ? heading(p.heading, 2, "yp-quotes__heading") : "") +
        group("yp-quotes__grid", items),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-quotes");
    if (!el) return null;

    return {
      heading: text(el.querySelector(".yp-quotes__heading")),
      items: el
        .querySelectorAll(".yp-quotes__item")
        .map((q) => {
          const cite = text(q.querySelector("cite"));
          // Written as "Name · Role"; split back, tolerating a missing role.
          const [name = "", role = ""] = cite.split("·").map((s) => s.trim());
          const body = q.querySelector("p");
          return { quote: text(body), name, role };
        })
        .filter((i) => i.quote),
    };
  },
};
