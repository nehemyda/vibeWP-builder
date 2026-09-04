import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { formDefinitions } from "@/lib/db/schema";
import { staticFormMarkup } from "./static-markup";
import type { FormFieldSpec } from "@/app/actions/forms";

/**
 * Puts a working form inside every embed mount, at export time.
 *
 * A boundary transform, like the logo and the nav: which fields a form has is
 * a fact about the FORM, not about the section, and the section must stay
 * renderable in the library and the canvas where no form exists.
 *
 * Unknown or missing tokens are left exactly as they are — an empty mount that
 * the script will fill if it can. Failing to find a form must not remove the
 * embed, or a temporary lookup problem would strip a client's contact form
 * from their site permanently.
 */
export async function withStaticForms(html: string, endpoint: string): Promise<string> {
  /*
   * Point the script at US, not at the client's own site.
   *
   * The section emits src="/embed.js", which is correct in the builder and
   * wrong the moment the page is exported: on WordPress it resolves against
   * THEIR domain, 404s, and the form silently falls back to a full page reload
   * instead of an inline thank-you. Rewritten here for the same reason the form
   * action is — where the page will live is a fact about export, not about the
   * section.
   */
  let origin = "";
  try {
    origin = new URL(endpoint).origin;
  } catch {
    // A malformed endpoint must not strip the script; a relative src at least
    // keeps working wherever the origin happens to match.
  }
  if (origin) {
    html = html.replace(
      /<script src="\/embed\.js"([^>]*)><\/script>/g,
      `<script src="${origin}/embed.js"$1></script>`,
    );
  }

  const tokens = [...html.matchAll(/data-vibewp-form="([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
  if (tokens.length === 0) return html;

  const unique = [...new Set(tokens)];
  const forms = new Map<string, { fields: FormFieldSpec[]; style: Record<string, string> }>();
  for (const token of unique) {
    const form = await db.query.formDefinitions.findFirst({
      where: eq(formDefinitions.embedToken, token),
    });
    if (form?.isActive)
      forms.set(token, {
        fields: (form.fields as FormFieldSpec[]) ?? [],
        style: (form.style as Record<string, string>) ?? {},
      });
  }

  return html.replace(
    /<div class="yp-embed__mount" data-vibewp-form="([^"]*)"><\/div>/g,
    (whole, token: string) => {
      const form = forms.get(token);
      if (!form || form.fields.length === 0) return whole;
      return (
        `<div class="yp-embed__mount" data-vibewp-form="${token}">` +
        staticFormMarkup({ fields: form.fields, token, endpoint, style: form.style }) +
        "</div>"
      );
    },
  );
}
