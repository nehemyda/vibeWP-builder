import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { formDefinitions } from "@/lib/db/schema";
import type { FormFieldSpec } from "@/app/actions/forms";

/**
 * The site's form, created on demand.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY GENERATION NEEDS THIS
 *
 * A generated Contact page carries a FormEmbed node, which is only a pointer.
 * If nothing puts a real form behind it, the live page shows an empty space —
 * a contact page that cannot be contacted, which is worse than not having one.
 *
 * Reuses the site's existing form rather than making another. Several
 * near-identical forms is how a leads inbox becomes unreadable, and a client
 * who has already shaped their form does not want generation quietly replacing
 * it with defaults.
 */

/** The four questions almost every small business actually needs. */
const STARTER_FIELDS: FormFieldSpec[] = [
  { name: "name", label: "Your name", type: "text", required: true, span: 6 },
  { name: "email", label: "Email", type: "email", required: true, span: 6 },
  { name: "phone", label: "Phone", type: "tel", span: 6 },
  { name: "message", label: "How can we help?", type: "textarea", required: true, span: 12 },
];

export async function ensureSiteForm(siteId: string, businessName?: string): Promise<string | null> {
  const existing = await db.query.formDefinitions.findFirst({
    where: and(eq(formDefinitions.siteId, siteId), eq(formDefinitions.isActive, true)),
  });
  if (existing?.embedToken) return existing.embedToken;

  const embedToken = `frm_${randomBytes(18).toString("base64url")}`;
  try {
    await db.insert(formDefinitions).values({
      siteId,
      name: businessName ? `${businessName} enquiries` : "Contact form",
      fields: STARTER_FIELDS,
      embedToken,
      successMessage: "Thanks — we'll be in touch.",
    });
    return embedToken;
  } catch (err) {
    /*
     * Never throws. A page without a form is recoverable — the client attaches
     * one from Leads & forms — whereas a failed generation loses the whole
     * page. The node keeps its empty token until a form is attached.
     */
    console.error("Could not create a form for the generated page:", err);
    return null;
  }
}
