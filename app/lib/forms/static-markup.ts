import { esc, escAttr } from "@/lib/wp/blocks";
import type { FormFieldSpec } from "@/app/actions/forms";

/**
 * A working form, rendered at export time, with no JavaScript involved.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY AN EMBED NEEDS A FALLBACK AT ALL
 *
 * An embedded form makes a client's website depend on VibeWP being reachable:
 * if the script cannot load, their contact page silently has no form. That is
 * the same silent third-party dependency I argued against when images were
 * hot-linked from Pexels, and it fails worse — a missing image is visible,
 * a missing form just loses enquiries nobody knows were attempted.
 *
 * So export writes a real <form> with real named inputs and a real action. It
 * submits without any script, and the endpoint answers a urlencoded post with
 * a redirect. embed.js clears the mount before rendering, so when the script
 * DOES load the enhanced form simply replaces this one.
 *
 * Rendered from the stored definition, so the fallback asks the same questions
 * as the real thing rather than a guess at them.
 */
export function staticFormMarkup(opts: {
  fields: FormFieldSpec[];
  token: string;
  endpoint: string;
  submitLabel?: string;
}): string {
  const { fields, token, endpoint, submitLabel } = opts;

  const controls = fields
    .map((f) => {
      const id = `vwf-${escAttr(token)}-${escAttr(f.name)}`;
      const req = f.required ? " required" : "";
      const ph = f.placeholder ? ` placeholder="${escAttr(f.placeholder)}"` : "";
      const span = typeof f.span === "number" ? Math.min(12, Math.max(1, f.span)) : 6;

      let control: string;
      if (f.type === "textarea") {
        control = `<textarea id="${id}" name="${escAttr(f.name)}" rows="5" class="vibewp-form__control"${req}${ph}></textarea>`;
      } else if (f.type === "select") {
        const opts = (f.options ?? [])
          .map((o) => `<option value="${escAttr(o)}">${esc(o)}</option>`)
          .join("");
        control = `<select id="${id}" name="${escAttr(f.name)}" class="vibewp-form__control"${req}>${opts}</select>`;
      } else {
        control = `<input id="${id}" name="${escAttr(f.name)}" type="${escAttr(f.type)}" class="vibewp-form__control"${req}${ph}>`;
      }

      return (
        `<div class="vibewp-form__field" style="grid-column:span ${span}">` +
        `<label class="vibewp-form__label" for="${id}">${esc(f.label || f.name)}` +
        (f.required ? '<span class="vibewp-form__req" aria-hidden="true">*</span>' : "") +
        `</label>${control}</div>`
      );
    })
    .join("");

  return (
    `<form class="vibewp-form" method="post" action="${escAttr(endpoint)}">` +
    controls +
    // Off-screen, not display:none — bots increasingly skip the obvious tell.
    '<div class="vibewp-form__hp" aria-hidden="true">' +
    '<input type="text" name="website" tabindex="-1" autocomplete="off"></div>' +
    `<input type="hidden" name="site" value="${escAttr(token)}">` +
    `<button type="submit" class="vibewp-form__submit">${esc(submitLabel || "Send")}</button>` +
    "</form>"
  );
}
