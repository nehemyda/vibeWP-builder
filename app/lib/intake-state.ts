import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessProfiles, sites } from "@/lib/db/schema";
import { DEFAULT_PALETTE_KEY, resolveBrandColors } from "@/lib/brand/palettes";
import { contactFactsFor, loadBusinessContext, type BusinessContext } from "@/lib/ai/business-context";
import {
  defaultHours,
  parseHours,
  parseServices,
  type OpeningHours,
  type ServiceEntry,
} from "@/lib/business/hours";
import { type PaletteColors } from "@/lib/brand/palettes";

/*
 * The intake's shapes live here rather than beside the action.
 *
 * They were declared in app/actions/intake.ts, which is a "use server" module.
 * A type import from one is erased and so harmless at runtime, but it points
 * the dependency the wrong way — the loader would import from the action that
 * wraps it. The action re-exports these, so every existing call site is
 * unchanged.
 */
export type IntakeData = {
  businessName: string;
  /** Data URL, or "" for none. */
  logoUrl: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  postcode: string;
  hours: OpeningHours;
  services: ServiceEntry[];
  about: string;
  seoKeywords: string;
  paletteKey: string;
  colors: PaletteColors;
};

export type IntakeState = {
  data: IntakeData;
  /** False the first time — drives "Build my site" vs "Edit my site". */
  completed: boolean;
  /**
   * phone / email / address / hours, resolved.
   *
   * Returned alongside the form because generated content carries {{phone}}
   * rather than a literal, and the canvas needs the values to substitute. After
   * a save this is what lets the preview show the new number immediately,
   * without a page reload and without regenerating anything.
   */
  facts: Record<string, string>;
};

/**
 * Reading the intake prefill, WITHOUT checking who is asking.
 *
 * ─────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE CALLING IT
 *
 * There is no permission check in here. The caller must already have
 * established that this user may see this site — `requireSiteAccess` on a
 * page, `requireEditor` in an action. It lives in lib/ and NOT in a
 * "use server" file precisely so it cannot be reached from a browser: every
 * export of a "use server" module is a remotely callable endpoint, and an
 * unauthenticated loader exported from one would be a way to read any site's
 * business details by id.
 *
 * WHY IT EXISTS AT ALL
 *
 * loadIntakeAction did its own authentication — a supabase getUser() over the
 * network plus canEditSite's four queries — and the builder page called it
 * immediately after requireSiteAccess had proven the same thing. The page paid
 * for the answer twice, and the second time cost more than the data.
 *
 * The action still authenticates; it wraps this. Only a caller that has
 * already done the work skips it.
 *
 * WHY THE QUERIES ARE ONE BATCH
 *
 * They were four serial awaits (site, profile, then loadBusinessContext's own
 * two) and none of them needed anything from the one before. Handing `site`
 * to loadBusinessContext drops one of the four outright, since it would
 * otherwise fetch the row this function has just read.
 * ─────────────────────────────────────────────────────────────────────
 */
export async function loadIntakeState(siteId: string): Promise<IntakeState> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  if (!site) throw new Error("Site not found.");

  const [profile, ctx] = await Promise.all([
    db.query.businessProfiles.findFirst({
      where: and(eq(businessProfiles.ownerId, siteId), eq(businessProfiles.ownerType, "site")),
    }),
    loadBusinessContext(siteId, { site }),
  ]);

  const paletteKey = site.brandPaletteKey ?? DEFAULT_PALETTE_KEY;

  return {
    completed: Boolean(site.intakeCompletedAt),
    facts: contactFactsFor(ctx ?? emptyContext()),
    data: {
      businessName: site.name ?? "",
      logoUrl: profile?.logoUrl ?? "",
      phone: profile?.phoneNumber ?? "",
      email: profile?.email ?? "",
      address: profile?.address ?? "",
      city: profile?.city ?? "",
      postcode: profile?.zip ?? "",
      hours: parseHours(profile?.openingHours) ?? defaultHours(),
      services: parseServices(profile?.services),
      about: profile?.aboutText ?? "",
      seoKeywords: profile?.seoKeywords ?? "",
      paletteKey,
      colors: resolveBrandColors(paletteKey, site.brandColors),
    },
  };
}

/** A site with no business profile yet: every fact absent, none invented. */
export function emptyContext(): BusinessContext {
  return {
    businessName: "",
    categories: null,
    tags: null,
    city: null,
    state: null,
    country: null,
    phone: null,
    email: null,
    street: null,
    postcode: null,
    website: null,
    about: null,
    services: [],
    seoKeywords: null,
    hours: null,
    logoUrl: null,
  };
}
