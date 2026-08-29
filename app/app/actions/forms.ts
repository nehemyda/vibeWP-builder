"use server";

import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { formDefinitions } from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";

/**
 * Creating and editing the forms a client embeds.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A FORM IS A DEFINITION, NOT MARKUP
 *
 * Everything downstream reads `fields`: the embed script renders from it, and
 * the submit endpoint validates against it. That single source is what stops
 * the two disagreeing — a field removed here can no longer be submitted, with
 * no second place to remember to update.
 */

export type FormFieldSpec = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox" | "number" | "date" | "url";
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** For select: the choices offered. */
  options?: string[];
  /**
   * Width as a share of a 12-column row: 4 is a third, 6 a half, 12 full.
   *
   * Twelve rather than a list of named sizes because 12 divides by 2, 3, 4 and
   * 6 — so thirds and quarters are exact, and an unusual width like 5/12 is
   * still expressible. A fixed set of names cannot do both.
   */
  span?: number;
  /** Superseded by `span`; still read so forms saved before it keep working. */
  width?: "full" | "half";
};

/** What a brand-new form starts with — the four questions almost every form asks. */
const STARTER_FIELDS: FormFieldSpec[] = [
  { name: "name", label: "Your name", type: "text", required: true, span: 6 },
  { name: "email", label: "Email", type: "email", required: true, span: 6 },
  { name: "phone", label: "Phone", type: "tel", span: 6 },
  { name: "message", label: "How can we help?", type: "textarea", required: true, span: 12 },
];

export async function createFormAction(smbId: string, name?: string) {
  const { site } = await requireSiteAccess(smbId);

  /*
   * The embed token is minted here, not on first embed.
   *
   * A form the client can see but not yet paste anywhere is a form that looks
   * broken. 18 bytes of crypto randomness: it is public, but a guessable one
   * would let a stranger post into someone's leads.
   */
  const [created] = await db
    .insert(formDefinitions)
    .values({
      siteId: site.id,
      name: name?.trim() || "New form",
      fields: STARTER_FIELDS,
      embedToken: `frm_${randomBytes(18).toString("base64url")}`,
      successMessage: "Thanks — we'll be in touch.",
    })
    .returning();

  revalidatePath("/dashboard", "layout");
  return { ok: true as const, id: created.id };
}

export async function saveFormAction(opts: {
  smbId: string;
  formId: string;
  name: string;
  fields: FormFieldSpec[];
  successMessage: string;
  notifyEmails: string;
}) {
  const { site } = await requireSiteAccess(opts.smbId);

  /*
   * Scoped to the site in the WHERE clause, not merely checked beforehand.
   *
   * A form id is guessable enough that "load it, compare siteId, then update"
   * leaves a window and one forgotten branch between the check and the write.
   * Making ownership part of the update means a mismatched id changes nothing.
   */
  const [updated] = await db
    .update(formDefinitions)
    .set({
      name: opts.name.trim() || "Untitled form",
      fields: opts.fields,
      successMessage: opts.successMessage.trim() || null,
      notifyEmails: opts.notifyEmails.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(formDefinitions.id, opts.formId), eq(formDefinitions.siteId, site.id)))
    .returning();

  if (!updated) return { ok: false as const, error: "That form doesn't exist." };

  revalidatePath("/dashboard", "layout");
  return { ok: true as const };
}

/**
 * Switches a form off without deleting it.
 *
 * Deleting would take its submissions' link with it, and a client who wants a
 * form to stop collecting almost never wants last month's enquiries to become
 * anonymous. The endpoint treats an inactive form as unknown.
 */
export async function setFormActiveAction(smbId: string, formId: string, active: boolean) {
  const { site } = await requireSiteAccess(smbId);
  await db
    .update(formDefinitions)
    .set({ isActive: active, updatedAt: new Date() })
    .where(and(eq(formDefinitions.id, formId), eq(formDefinitions.siteId, site.id)));
  revalidatePath("/dashboard", "layout");
  return { ok: true as const };
}

/**
 * Deletes a form. Its submissions survive.
 *
 * `form_submissions.form_id` is ON DELETE SET NULL precisely for this: a lead
 * is a person who asked to be contacted, and removing the form they happened
 * to use must never remove them. They stay in the Submissions list with their
 * answers intact, just no longer attributed to a form that no longer exists.
 */
export async function deleteFormAction(smbId: string, formId: string) {
  const { site } = await requireSiteAccess(smbId);

  // Ownership in the WHERE clause, so a mismatched id deletes nothing.
  const [gone] = await db
    .delete(formDefinitions)
    .where(and(eq(formDefinitions.id, formId), eq(formDefinitions.siteId, site.id)))
    .returning({ id: formDefinitions.id });

  if (!gone) return { ok: false as const, error: "That form doesn't exist." };

  revalidatePath("/dashboard", "layout");
  return { ok: true as const };
}
