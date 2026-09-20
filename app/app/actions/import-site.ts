"use server";

import { createClient } from "@/lib/supabase/server";
import { canEditSite } from "@/app/actions/sites";
import { readSite } from "@/lib/import/read-site";
import { enrichFromPageText } from "@/lib/import/enrich";
import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { runWithUsageContext, attributeUsageTo } from "@/lib/ai/usage";
import type { IntakeData } from "@/lib/intake-state";
import type { ServiceEntry } from "@/lib/business/hours";

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

/**
 * One field we could fill, and where it came from.
 *
 * Two shapes because intake stores services as rows, not a sentence, and a
 * proposal that flattened them to text would have to be split apart again
 * on the way in — guessing at the separator a model happened to use.
 */
export type ImportedField =
  | { kind: "text"; field: keyof IntakeData; label: string; value: string; source: string }
  | { kind: "services"; field: "services"; label: string; value: ServiceEntry[]; source: string };

export type ImportResult =
  | {
      ok: true;
      url: string;
      fields: ImportedField[];
      /**
       * Why the fuzzy fields are missing, when they are. The structured ones
       * arrive regardless — a phone number read off a schema block does not
       * depend on a model being up — so an AI failure is a note, not an error.
       */
      note?: string;
    }
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

type ImportOpts = { siteId: string; url: string };

export async function importFromWebsiteAction(opts: ImportOpts): Promise<ImportResult> {
  return runWithUsageContext({ siteId: opts.siteId, action: "import_site" }, () => runImport(opts));
}

async function runImport(opts: ImportOpts): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!(await canEditSite(user.id, opts.siteId))) {
    return { ok: false, error: "You don't have access to this site." };
  }
  attributeUsageTo(user.id);

  if (!opts.url.trim()) return { ok: false, error: "Enter your website address first." };

  const read = await readSite(opts.url);
  if (!read.ok) return { ok: false, error: read.reason };

  const fields: ImportedField[] = [];
  for (const [field, label] of Object.entries(LABELS) as Array<[keyof IntakeData, string]>) {
    const found = read.profile[field as keyof typeof read.profile];
    if (found && typeof found.value === "string" && found.value.trim()) {
      fields.push({ kind: "text", field, label, value: found.value, source: found.source });
    }
  }

  /*
   * The two fields nothing declares — services and about — read by the model
   * from the page's TEXT. Only if a provider is configured; the structured
   * fields above do not depend on it, and a site with no AI key should still
   * get a phone number out of this.
   */
  let note: string | undefined;
  const settings = await getAiProviderSettings();
  if (settings.activeProvider === "gemini" && settings.geminiApiKey) {
    const { result, error } = await enrichFromPageText({
      apiKey: settings.geminiApiKey,
      pageText: read.text,
    });

    if (error) {
      note = `Couldn't read services and about from the page: ${error}. The details above came from the page directly.`;
    }

    if (result.services.length) {
      fields.push({
        kind: "services",
        field: "services",
        label: "Services",
        value: result.services.map((name) => ({ name })),
        /* Labelled as what it is. A schema field is a declaration; this is a
           reading, and the reviewer should weigh it accordingly. */
        source: "the page's wording, read by AI — check this",
      });
    }

    if (result.about) {
      /*
       * The model's summary replaces the meta description when both exist. A
       * meta description is written for a search result — one line, keyword-
       * led, often stale — where this is written for the field it will fill.
       * The meta version is never worse than absent, so it stays when the
       * model has nothing.
       */
      const i = fields.findIndex((f) => f.field === "about");
      const about: ImportedField = {
        kind: "text",
        field: "about",
        label: "About",
        value: result.about,
        source: "an AI summary of the page — check this",
      };
      if (i >= 0) fields[i] = about;
      else fields.push(about);
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

  return { ok: true, url: read.url, fields, note };
}
