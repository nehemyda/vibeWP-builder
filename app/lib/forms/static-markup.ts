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
/**
 * The width a field gets when nothing has set one.
 *
 * Type-aware, because 6 for everything put a textarea at half width — which no
 * one has ever wanted, and which is what a form saved before spans existed
 * still renders as. A long answer needs the row; a name does not.
 */
export function defaultSpan(type: string): number {
  return type === "textarea" ? 12 : 6;
}

export function staticFormMarkup(opts: {
  fields: FormFieldSpec[];
  token: string;
  endpoint: string;
  submitLabel?: string;
  /** The form's saved styling, as tokens. */
  style?: Record<string, string>;
  /**
   * Render for the builder canvas: identical markup and classes, but a <div>
   * instead of a <form> and a button that goes nowhere.
   *
   * The canvas used to draw its own skeleton with its own classes, so the
   * preview and the real form were two stylesheets describing one thing and
   * drifted apart every time either changed. Sharing the renderer is what makes
   * "does it match?" stop being a question.
   *
   * It must not be a <form>: with no action a submit navigates the iframe, and
   * with one it posts a real lead every time somebody looks at a page.
   */
  inert?: boolean;
}): string {
  const { fields, token, endpoint, submitLabel, style, inert } = opts;

  /*
   * The client's styling, inline on the form.
   *
   * embed.js applies these when it renders, but the exported form must carry
   * them itself — otherwise a form styled with a background renders without one
   * until the script loads, and permanently if it never does. Keys are
   * validated: these become CSS custom properties, and stored text must not be
   * able to become anything else.
   */
  const tokens = Object.entries(style ?? {})
    .filter(([k]) => /^[a-z0-9-]+$/i.test(k))
    .map(([k, v]) => `--vwf-${k}:${String(v).replace(/[;"<>]/g, "")}`)
    .join(";");

  const controls = fields
    .map((f) => {
      const id = `vwf-${escAttr(token)}-${escAttr(f.name)}`;
      const req = f.required ? " required" : "";
      const ph = f.placeholder ? ` placeholder="${escAttr(f.placeholder)}"` : "";
      const span = typeof f.span === "number" ? Math.min(12, Math.max(1, f.span)) : defaultSpan(f.type);

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
    (inert
      ? `<div class="vibewp-form"${tokens ? ` style="${escAttr(tokens)}"` : ""}>`
      : `<form class="vibewp-form" method="post" action="${escAttr(endpoint)}"${
          tokens ? ` style="${escAttr(tokens)}"` : ""
        }>`) +
    controls +
    // The honeypot and the token are for real submissions only; the canvas has
    // nothing to submit, and shipping them there would be noise.
    (inert
      ? ""
      : '<div class="vibewp-form__hp" aria-hidden="true">' +
        '<input type="text" name="website" tabindex="-1" autocomplete="off"></div>' +
        `<input type="hidden" name="site" value="${escAttr(token)}">`) +
    `<button type="${inert ? "button" : "submit"}" class="vibewp-form__submit">${esc(
      submitLabel || "Send",
    )}</button>` +
    (inert ? "</div>" : "</form>")
  );
}
