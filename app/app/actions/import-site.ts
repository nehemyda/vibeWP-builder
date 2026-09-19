"use server";

import { createClient } from "@/lib/supabase/server";
import { canEditSite } from "@/app/actions/sites";
import { readSite } from "@/lib/import/read-site";
import type { IntakeData } from "@/lib/intake-state";

/**
 * Reading a client's existing website, for the intake form to offer.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS RETURNS A PROPOSAL AND NOT A SAVE
 *
 * Every value is something a page CLAIMED, and the person who knows whether a
 * phone number is still the right one is the client looking at the form. So
 * this hands back field/value/source and touches nothing. The same shape the
 * WordPress drift panel already uses, for the same reason: a change to a
 * client's details is theirs to accept.
 *
 * WHY IT IS PERMISSION-CHECKED
 *
 * It makes this server fetch a URL the caller chose. safeFetch decides WHERE
 * that may point; this decides WHO may ask. Without it, anyone with a session
 * could use the platform as an anonymous fetcher for any page on the web.
 * ─────────────────────────────────────────────────────────────────────
 */

/** One field we could fill, and where it came from. */
export type ImportedField = {
  field: keyof IntakeData;
  label: string;
  value: string;
  source: string;
};

export type ImportResult =
  | { ok: true; url: string; fields: ImportedField[] }
  | { ok: false; error: string };

const LABELS: Partial<Record<keyof IntakeData, string>> = {
  businessName: "Business name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  city: "Town or city",
  postcode: "Postcode",
  about: "About",
};

export async function importFromWebsiteAction(opts: {
  siteId: string;
  url: string;
}): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!(await canEditSite(user.id, opts.siteId))) {
    return { ok: false, error: "You don't have access to this site." };
  }

  if (!opts.url.trim()) return { ok: false, error: "Enter your website address first." };

  const read = await readSite(opts.url);
  if (!read.ok) return { ok: false, error: read.reason };

  const fields: ImportedField[] = [];
  for (const [field, label] of Object.entries(LABELS) as Array<[keyof IntakeData, string]>) {
    const found = read.profile[field as keyof typeof read.profile];
    if (found && typeof found.value === "string" && found.value.trim()) {
      fields.push({ field, label, value: found.value, source: found.source });
    }
  }

  if (fields.length === 0) {
    /*
     * A real outcome, not an error. Plenty of sites publish no structured data
     * at all, and saying so plainly is better than an empty panel the client
     * has to interpret — or worse, guessing from their page text to have
     * something to show.
     */
    return {
      ok: false,
      error: "That page didn't publish any business details we could read. Fill the form in below instead.",
    };
  }

  return { ok: true, url: read.url, fields };
}
