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

/**
 * The kind of form a sentence asks for, if it names one.
 *
 * "Add a quote form" and "add a contact form" are different requests. Reusing
 * one form for both put quote requests into the contact inbox under the
 * contact form's questions — the page had a form, just not the one that was
 * asked for.
 *
 * Only purposes a small business really distinguishes. Anything else is a
 * contact form, and inventing a separate inbox per phrasing is how a leads
 * list becomes unreadable.
 */
const PURPOSES = [
  ["quote", "Quote requests"],
  ["booking", "Bookings"],
  ["book", "Bookings"],
  ["appointment", "Appointments"],
  ["order", "Orders"],
  ["callback", "Callback requests"],
  ["estimate", "Estimate requests"],
  ["consultation", "Consultation requests"],
] as const;

export function purposeFrom(instruction?: string): { key: string; name: string } | null {
  const text = (instruction ?? "").toLowerCase();
  for (const [key, name] of PURPOSES) {
    // Only when it is the KIND of form being asked for, not any mention of the
    // word: "quote form", "booking form", "form for bookings".
    /*
     * Up to two words may sit between the purpose and "form".
     *
     * "quote request form" and "booking request form" are how people actually
     * say it, and requiring them to be adjacent missed both — the request fell
     * through to the contact form, which was then named in the reply.
     */
    if (
      new RegExp(`\\b${key}\\w*(?:\\s+\\w+){0,2}\\s+form\\b`).test(text) ||
      new RegExp(`\\bform\\s+for\\s+(?:\\w+\\s+){0,2}${key}`).test(text)
    ) {
      return { key, name };
    }
  }
  return null;
}

export async function ensureSiteForm(
  siteId: string,
  businessName?: string,
  /** What the client asked for, so "quote form" is not answered with the contact one. */
  instruction?: string,
): Promise<string | null> {
  const purpose = purposeFrom(instruction);

  if (purpose) {
    // A form already serving this purpose is the one to use.
    const forms = await db
      .select()
      .from(formDefinitions)
      .where(and(eq(formDefinitions.siteId, siteId), eq(formDefinitions.isActive, true)));
    const match = forms.find((f) => f.name.toLowerCase().includes(purpose.key));
    if (match?.embedToken) return match.embedToken;
    return createForm(siteId, purpose.name);
  }

  const existing = await db.query.formDefinitions.findFirst({
    where: and(eq(formDefinitions.siteId, siteId), eq(formDefinitions.isActive, true)),
  });
  if (existing?.embedToken) return existing.embedToken;

  return createForm(siteId, businessName ? `${businessName} enquiries` : "Contact form");
}

async function createForm(siteId: string, name: string): Promise<string | null> {
  const embedToken = `frm_${randomBytes(18).toString("base64url")}`;
  try {
    await db.insert(formDefinitions).values({
      siteId,
      name,
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
