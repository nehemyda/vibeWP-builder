"use server";

import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sites, businessProfiles, type SiteMode } from "@/lib/db/schema";
import { canEditSite } from "@/app/actions/sites";
import { logActivity } from "@/lib/activity";
import { profiles } from "@/lib/db/schema";
import { isHexColor, paletteByKey, type PaletteColors } from "@/lib/brand/palettes";
import { loadBusinessContext, contactFactsFor } from "@/lib/ai/business-context";
import {
  emptyContext,
  loadIntakeState,
  type IntakeData,
  type IntakeState,
} from "@/lib/intake-state";
/* Re-exported so every existing importer of these types is unchanged. */
export type { IntakeData, IntakeState } from "@/lib/intake-state";
import { LOGO_MAX_BYTES, isSupportedLogoDataUrl } from "@/lib/business/logo";
import { defaultHours, parseHours, parseServices, type ServiceEntry } from "@/lib/business/hours";

/**
 * The client intake form: what we ask for once, so we never have to guess.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Generation is forbidden from inventing a phone number, an address or an
 * opening time — an invented phone number is a real number belonging to
 * somebody else. That rule is right, and it means output quality is bounded by
 * what we actually know. Before this form we knew one fact about a typical
 * site: its name. So a generated contact section came back with every field
 * empty, correctly and uselessly.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT WRITES business_profiles AND NOT A NEW TABLE
 *
 * That row already holds the address, phone and categories, and the Settings
 * screen already edits it. A parallel copy would drift, and nothing would say
 * which one generation should believe.
 */

/** Facts for the preview, tolerating a site whose profile row is missing. */
async function buildContext(siteId: string) {
  return (await loadBusinessContext(siteId)) ?? emptyContext();
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

/**
 * Everything we already know, so the form opens filled in.
 *
 * The point of the prefill: a client who completed Business details in Settings
 * should not be asked for their phone number a second time. Anything absent
 * comes back as an empty string rather than null, so the form binds directly.
 */
export async function loadIntakeAction(siteId: string): Promise<IntakeState> {
  await requireEditor(siteId);
  return loadIntakeState(siteId);
}

/**
 * Saves the form.
 *
 * Returns a one-line summary for the chat rather than the caller building one:
 * what was saved and what gets announced should come from the same place, or
 * the transcript ends up describing something other than what was stored.
 */
export async function saveIntakeAction(opts: {
  siteId: string;
  data: IntakeData;
}): Promise<
  | { ok: true; summary: string; facts: Record<string, string> }
  | { ok: false; error: string }
> {
  const { siteId, data } = opts;
  const user = await requireEditor(siteId);

  const name = data.businessName.trim();
  if (!name) return { ok: false, error: "A business name is required." };

  /*
   * Colours are written into theme.json and served as CSS to every visitor, so
   * anything that is not a plain hex value is dropped back to the preset rather
   * than trusted. This is a sanitiser, not a validator — the form already
   * restricts input, and this is the boundary that has to hold anyway.
   */
  const palette = paletteByKey(data.paletteKey);
  const colors: PaletteColors = { ...palette.colors };
  for (const slug of Object.keys(colors) as Array<keyof PaletteColors>) {
    const value = data.colors?.[slug];
    if (typeof value === "string" && isHexColor(value)) colors[slug] = value.trim();
  }

  const services = parseServices(data.services);
  const hours = parseHours(data.hours) ?? defaultHours();

  /*
   * Mode is settable on the FIRST build and never again.
   *
   * This form reopens from the toolbar as "Business details", so treating mode
   * like any other field would let someone flip a provisioned WordPress site to
   * Vibe by editing their phone number — orphaning the install and the charge
   * behind it. Moving between modes is a deliberate, billed action, not a side
   * effect of saving a form.
   */
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  const mode: SiteMode | undefined = site?.intakeCompletedAt
    ? undefined
    : data.mode === "wordpress"
      ? "wordpress"
      : "vibe";

  /*
   * The logo is written into an <img src> on the client's live site, so it is
   * validated here rather than trusted. Only raster image data URLs are kept:
   * SVG is deliberately excluded because an SVG can carry script, and this
   * value is served to every visitor of the site.
   */
  const logo = data.logoUrl?.trim() ?? "";
  let logoUrl: string | null = null;
  if (logo) {
    if (!isSupportedLogoDataUrl(logo)) {
      return { ok: false, error: "That logo format isn't supported — use a PNG, JPG or WebP." };
    }
    if (logo.length > LOGO_MAX_BYTES) {
      return { ok: false, error: "That logo is too large. Try an image under 400KB." };
    }
    logoUrl = logo;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(sites)
      .set({
        name,
        brandPaletteKey: palette.key,
        brandColors: colors,
        ...(mode ? { mode } : {}),
        intakeCompletedAt: new Date(),
        lastEditedAt: new Date(),
      })
      .where(eq(sites.id, siteId));

    const values = {
      logoUrl,
      phoneNumber: data.phone.trim() || null,
      email: data.email.trim() || null,
      address: data.address.trim() || null,
      city: data.city.trim() || null,
      zip: data.postcode.trim() || null,
      openingHours: hours,
      services,
      aboutText: data.about.trim() || null,
      seoKeywords: data.seoKeywords.trim() || null,
      updatedAt: new Date(),
    };

    const existing = await tx.query.businessProfiles.findFirst({
      where: and(
        eq(businessProfiles.ownerId, siteId),
        eq(businessProfiles.ownerType, "site"),
      ),
    });

    if (existing) {
      await tx.update(businessProfiles).set(values).where(eq(businessProfiles.id, existing.id));
    } else {
      await tx
        .insert(businessProfiles)
        .values({ ownerType: "site", ownerId: siteId, ...values });
    }
  });

  const actor = await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) });
  await logActivity({
    actorUserId: user.id,
    actorName: actor?.fullName ?? "Unknown",
    action: "site.intake_saved",
    targetType: "site",
    targetId: siteId,
    targetLabel: name,
    metadata: { services: services.length, palette: palette.key },
  });

  return {
    ok: true,
    summary: summarise(name, services, palette.name, data),
    facts: contactFactsFor(await buildContext(siteId)),
  };
}

/**
 * The line that appears in the chat.
 *
 * DELIBERATELY A SUMMARY, NOT THE FORM'S CONTENTS.
 *
 * The obvious implementation is to paste every field into the prompt. That
 * would put the phone number in front of the model as text to be rewritten,
 * and a model that can see a phone number can reformat it, drop a digit or
 * fold it into a sentence. The facts reach generation through the database,
 * where nothing can paraphrase them; this line only tells the user what is
 * about to happen.
 */
function summarise(
  name: string,
  services: ServiceEntry[],
  paletteName: string,
  data: IntakeData,
): string {
  const bits = [`Build the site for ${name}`];
  if (services.length) {
    bits.push(`${services.length} service${services.length === 1 ? "" : "s"}`);
  }
  if (data.city.trim()) bits.push(data.city.trim());
  bits.push(`${paletteName} colours`);
  return `${bits.join(" — ")}.`;
}
