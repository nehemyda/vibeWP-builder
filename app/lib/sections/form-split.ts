import type { HTMLElement } from "node-html-parser";
import { group, heading, paragraph, list, htmlBlock, formMount } from "@/lib/wp/blocks";
import type { SectionDefinition } from "./types";

export type FormSplitProps = {
  heading?: string;
  body?: string;
  points?: string[];
  formToken?: string;
};

const text = (el: HTMLElement | null): string => (el ? el.textContent.trim() : "");

/**
 * Reassurance on the left, the form on the right.
 *
 * The workhorse layout for an enquiry page, and the reason is behavioural: a
 * form on its own asks for effort before it has given a reason. The left column
 * answers the three doubts that stop someone typing — how fast you reply, what
 * happens next, whether it costs anything — and stays beside the fields while
 * they fill them in, rather than scrolling away above.
 */
export const FormSplit: SectionDefinition<FormSplitProps> = {
  key: "form-split",
  nodeType: "FormSplit",
  name: "Form with reassurance",
  category: "Contact",
  description:
    "Your form beside a short case for filling it in — what happens next, how quickly you reply.",
  rootClass: "yp-formx",

  fields: {
    heading: { type: "text", label: "Heading", maxChars: 60 },
    body: { type: "text", label: "Opening line", maxChars: 180 },
    points: {
      type: "list",
      label: "Reassurances",
      hint: "Three at most — answer a doubt, don't list features",
      of: { text: { type: "text", label: "Point" } },
    },
  },

  aiPrompt:
    "The heading says what happens when they send it. Each reassurance answers a reason someone " +
    "hesitates — reply time, no obligation, who reads it — in under eight words. Never features.",

  sample: {
    heading: "Tell us what you need",
    body: "Send the details and we'll come back with options and a price — usually the same day.",
    points: ["Replied to within one working day", "No obligation, no hard sell", "Read by the owner, not a call centre"],
  },

  toGutenberg(p) {
    const left = [
      p.heading ? heading(p.heading, 2, "yp-formx__heading") : "",
      p.body ? paragraph(p.body, "yp-formx__body") : "",
      p.points?.length ? list(p.points, "yp-formx__points") : "",
    ]
      .filter(Boolean)
      .join("");

    return group(
      "yp-formx",
      group(
        "yp-formx__inner",
        group("yp-formx__copy", left) + group("yp-formx__form", htmlBlock(formMount(p.formToken))),
      ),
      "section",
    );
  },

  fromGutenberg(root) {
    const el = root.querySelector(".yp-formx");
    if (!el) return null;
    return {
      heading: text(el.querySelector(".yp-formx__heading")),
      body: text(el.querySelector(".yp-formx__body")),
      points: el.querySelectorAll(".yp-formx__points li").map((li) => li.textContent.trim()),
      formToken: el.querySelector(".yp-embed__mount")?.getAttribute("data-vibewp-form") ?? "",
    };
  },
};
