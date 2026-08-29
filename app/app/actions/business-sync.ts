"use server";

import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sites, siteInstallations, businessProfiles, profiles } from "@/lib/db/schema";
import { canEditSite } from "@/app/actions/sites";
import { logActivity } from "@/lib/activity";
import { readBusinessOptions } from "@/lib/wp/local-driver";
import { loadBusinessContext, contactFactsFor } from "@/lib/ai/business-context";

/**
 * Business details, WordPress side vs VibeWP side.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Export pushed these options and nothing ever read them back. So a client who
 * corrected their phone number in Settings → Business details changed it on
 * their live site, saw no sign of it in the builder, and had it silently
 * overwritten by the next export.
 *
 * Page content already had this problem and already has the fix — detection on
 * open, and an export that refuses rather than clobbers. This gives the same
 * treatment to the details, because the failure is identical and worse: a wrong
 * phone number is a customer who cannot reach the business.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY ONLY SOME FIELDS CAN BE PULLED
 *
 * Two of the five are COMPOSED on the way out and cannot be reliably taken
 * apart again:
 *
 *   address — VibeWP holds street / city / postcode separately and joins them
 *   hours   — VibeWP holds a structured week and formats it as prose
 *
 * "14 Market Street, Bath, BA1 1AA" could be split on commas, and would be
 * wrong the first time a street name contains one. "Monday to Friday: 9am–5pm"
 * would have to be parsed back into seven day records, and any mistake silently
 * changes when a business appears to be open.
 *
 * So those two are DETECTED and shown, never auto-applied — the value is put in
 * front of whoever is editing so they can retype it into the structured fields.
 * Guessing badly is worse than asking.
 */

export type BusinessFieldDrift = {
  field: string;
  label: string;
  wordpress: string;
  vibewp: string;
  /** False for address and hours — see the note above. */
  pullable: boolean;
};

export type BusinessDriftReport =
  | { ok: true; drift: BusinessFieldDrift[] }
  | { ok: false; reason: string };

const LABELS: Record<string, string> = {
  business_name: "Business name",
  phone: "Phone",
  email: "Email",
  address: "Address",
  hours: "Opening hours",
};

/** Composed on the way out, so not safely reversible. */
const COMPOSED = new Set(["address", "hours"]);

/**
 * Normalises a value before comparing.
 *
 * WordPress stores what the textarea submitted, and a browser submits CRLF, so
 * the hours option comes back with \r\n where VibeWP wrote \n. Compared raw,
 * every site reported its opening hours as "changed in WordPress" the moment it
 * was exported — a warning about a difference nobody made, which is the fastest
 * way to teach someone to ignore warnings.
 *
 * The same lesson as canonical() in lib/wp/sync.ts: two systems serialising the
 * same thing agree on the content and disagree on the whitespace, so comparison
 * has to happen after normalising, never before.
 */
function normalise(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

async function requireEditor(siteId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (!(await canEditSite(user.id, siteId))) {
    throw new Error("You don't have access to this site.");
  }
  return user;
}

/** What VibeWP would push, so both sides are compared in the same shape. */
async function vibewpValues(siteId: string): Promise<Record<string, string>> {
  const ctx = await loadBusinessContext(siteId);
  if (!ctx) return {};
  const facts = contactFactsFor(ctx);
  return {
    business_name: ctx.businessName ?? "",
    phone: facts.phone ?? "",
    email: facts.email ?? "",
    address: facts.address ?? "",
    hours: facts.hours ?? "",
  };
}

/**
 * Compares the two sides.
 *
 * Returns `ok: false` rather than throwing when there is no WordPress site yet
 * or it cannot be reached: a site that has never been exported has nothing to
 * diverge from, and an unreachable one must not block anybody from editing.
 */
export async function detectBusinessDriftAction(siteId: string): Promise<BusinessDriftReport> {
  await requireEditor(siteId);

  const installation = await db.query.siteInstallations.findFirst({
    where: eq(siteInstallations.siteId, siteId),
  });
  if (!installation?.installPath || installation.status !== "ready") {
    return { ok: false, reason: "not_exported" };
  }

  let wp: Record<string, string>;
  try {
    wp = await readBusinessOptions(installation.installPath);
  } catch {
    return { ok: false, reason: "unreachable" };
  }

  const ours = await vibewpValues(siteId);

  const drift: BusinessFieldDrift[] = [];
  for (const field of Object.keys(LABELS)) {
    const theirs = normalise(wp[field] ?? "");
    const mine = normalise(ours[field] ?? "");

    /*
     * An empty WordPress value is not a difference worth reporting: it means
     * the option was never written, not that someone deliberately cleared it.
     * Treating it as drift would make every not-yet-exported field shout.
     */
    if (!theirs || theirs === mine) continue;

    drift.push({
      field,
      label: LABELS[field],
      wordpress: theirs,
      vibewp: mine,
      pullable: !COMPOSED.has(field),
    });
  }

  return { ok: true, drift };
}

/**
 * Takes WordPress's values for the fields that can be taken.
 *
 * Only the scalar fields, for the reason at the top of this file. The composed
 * ones are deliberately skipped and reported back so the caller can say so
 * rather than implying everything was applied.
 */
export async function pullBusinessDetailsAction(
  siteId: string,
): Promise<
  | { ok: true; applied: string[]; skipped: string[] }
  | { ok: false; error: string }
> {
  const user = await requireEditor(siteId);

  const report = await detectBusinessDriftAction(siteId);
  if (!report.ok) {
    return {
      ok: false,
      error:
        report.reason === "not_exported"
          ? "This site hasn't been exported to WordPress yet."
          : "Couldn't reach the WordPress site.",
    };
  }
  if (report.drift.length === 0) return { ok: true, applied: [], skipped: [] };

  const applied: string[] = [];
  const skipped: string[] = [];
  const profileUpdate: Record<string, string> = {};
  let siteName: string | null = null;

  for (const d of report.drift) {
    if (!d.pullable) {
      skipped.push(d.label);
      continue;
    }
    if (d.field === "business_name") siteName = d.wordpress;
    if (d.field === "phone") profileUpdate.phoneNumber = d.wordpress;
    if (d.field === "email") profileUpdate.email = d.wordpress;
    applied.push(d.label);
  }

  if (applied.length === 0) return { ok: true, applied, skipped };

  await db.transaction(async (tx) => {
    if (siteName) {
      await tx.update(sites).set({ name: siteName }).where(eq(sites.id, siteId));
    }

    if (Object.keys(profileUpdate).length > 0) {
      const existing = await tx.query.businessProfiles.findFirst({
        where: and(
          eq(businessProfiles.ownerId, siteId),
          eq(businessProfiles.ownerType, "site"),
        ),
      });
      if (existing) {
        await tx
          .update(businessProfiles)
          .set({ ...profileUpdate, updatedAt: new Date() })
          .where(eq(businessProfiles.id, existing.id));
      } else {
        await tx
          .insert(businessProfiles)
          .values({ ownerType: "site", ownerId: siteId, ...profileUpdate });
      }
    }
  });

  const actor = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  await logActivity({
    actorUserId: user.id,
    actorName: actor?.fullName ?? "Unknown",
    action: "site.business_pulled",
    targetType: "site",
    targetId: siteId,
    targetLabel: siteName ?? siteId,
    metadata: { applied, skipped },
  });

  return { ok: true, applied, skipped };
}
