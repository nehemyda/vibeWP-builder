import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans, agencyPlanPrices } from "@/lib/db/schema";

type Plan = typeof plans.$inferSelect;

/** Where a client's monthly price came from, so the UI can explain itself. */
export type PriceSource = "custom" | "agency" | "platform" | "unknown";

export type ResolvedPrice = {
  cents: number;
  source: PriceSource;
  planKey: string;
  plan: Plan | null;
};

/**
 * The canonical form of a stored plan value.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY EVERY COMPARISON MUST USE IT
 *
 * `plans.key` is always lowercase. The stored `sites.plan` / `agencies.plan`
 * columns were not: the column defaults wrote "starter" while every plan
 * <select> in the app wrote the title-case literal "Starter", so the same
 * plan existed under two spellings and a site's displayed plan depended on
 * how it happened to be created.
 *
 * That is not cosmetic. `sectionsForPlan` compared `sections.allowedPlans`
 * (which stores the lowercase key) against the raw column, so a section
 * restricted to ["growth","scale"] was invisible to every site on Earth,
 * including the Growth and Scale ones. The gate looked enforced and enforced
 * nothing.
 *
 * The selectors now submit `plans.key` and a migration has lowercased the
 * existing rows, so the data is canonical. This stays as the belt-and-braces
 * for anything that arrives from an older form post or an unmigrated row —
 * and as the one obvious place to route a new comparison through.
 * ─────────────────────────────────────────────────────────────────────
 */
export function planKeyOf(plan: string | null | undefined): string {
  return (plan ?? "").trim().toLowerCase();
}

/**
 * A plan's display name.
 *
 * Stored plan values are KEYS ("starter"), not names ("Starter"), so anything
 * showing one to a person has to resolve it. Pass the catalogue where the page
 * already has it; without one this title-cases the key, which is both readable
 * and exactly what the seeded plans are called.
 */
export function planLabel(
  plan: string | null | undefined,
  catalogue?: Pick<Plan, "key" | "name">[] | null,
): string {
  const key = planKeyOf(plan);
  if (!key) return "—";

  const named = catalogue?.find((p) => p.key === key)?.name;
  if (named) return named;

  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatCents(cents: number): string {
  return cents === 0 ? "Free" : `$${(cents / 100).toFixed(2)}`;
}

/** Parses a dollars-and-cents form field into integer cents. Blank → null. */
export function parseDollarsToCents(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Loads the plan catalogue and (optionally) one agency's reseller price list
 * up front, then resolves prices purely — so a page listing N client sites
 * doesn't issue N queries.
 *
 * What a client pays, in order: their own per-site override, then their
 * agency's price for that plan, then the platform list price.
 */
export async function loadPricingContext(agencyId: string | null) {
  const [planRows, agencyRows] = await Promise.all([
    db.select().from(plans),
    agencyId
      ? db.select().from(agencyPlanPrices).where(eq(agencyPlanPrices.agencyId, agencyId))
      : Promise.resolve([] as (typeof agencyPlanPrices.$inferSelect)[]),
  ]);

  const planByKey = new Map(planRows.map((p) => [p.key, p]));
  const agencyPriceByKey = new Map(agencyRows.map((r) => [r.planKey, r.priceMonthlyCents]));

  function planFor(plan: string | null | undefined): Plan | null {
    return planByKey.get(planKeyOf(plan)) ?? null;
  }

  /** The agency's own price for a plan, or null if they haven't set one. */
  function agencyPriceFor(plan: string | null | undefined): number | null {
    return agencyPriceByKey.get(planKeyOf(plan)) ?? null;
  }

  function platformPriceFor(plan: string | null | undefined): number | null {
    return planByKey.get(planKeyOf(plan))?.priceMonthlyCents ?? null;
  }

  /** The catalogue name for a stored plan value, for anything shown to a person. */
  function labelFor(plan: string | null | undefined): string {
    return planLabel(plan, planRows);
  }

  function resolve(site: {
    plan: string;
    customPriceMonthlyCents: number | null;
  }): ResolvedPrice {
    const planKey = planKeyOf(site.plan);
    const plan = planByKey.get(planKey) ?? null;

    if (site.customPriceMonthlyCents !== null) {
      return { cents: site.customPriceMonthlyCents, source: "custom", planKey, plan };
    }
    const agencyPrice = agencyPriceByKey.get(planKey);
    if (agencyPrice !== undefined) {
      return { cents: agencyPrice, source: "agency", planKey, plan };
    }
    if (plan) {
      return { cents: plan.priceMonthlyCents, source: "platform", planKey, plan };
    }
    return { cents: 0, source: "unknown", planKey, plan: null };
  }

  return {
    plans: planRows.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    allPlans: planRows,
    planFor,
    agencyPriceFor,
    platformPriceFor,
    labelFor,
    resolve,
  };
}

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  custom: "Custom for this client",
  agency: "Your plan price",
  platform: "Platform list price",
  unknown: "No plan on file",
};
