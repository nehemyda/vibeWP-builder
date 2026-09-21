import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, aiUsage, sites } from "@/lib/db/schema";
import { creditsFromTokens, type UsageAction } from "./usage";

/**
 * Reading the ledger back, for a dashboard.
 *
 * Credits are computed here from the summed tokens — the ledger holds tokens
 * only (see lib/ai/usage.ts). Nothing here enforces anything: this is the
 * measurement a client sees, and the same number a limit will later be set
 * against.
 */

/** What a client was doing, in their words rather than the action key's. */
export const USAGE_ACTION_LABELS: Record<UsageAction, string> = {
  generate_page: "Page builds",
  edit: "Edits",
  image_alt: "Image descriptions",
  page_meta: "Search descriptions",
  import_site: "Website imports",
};

export type UsageSummary = {
  since: Date;
  calls: number;
  totalTokens: number;
  credits: number;
  byAction: Array<{ action: UsageAction; label: string; calls: number; tokens: number; credits: number }>;
  lastAt: Date | null;
};

export function usageActionLabel(action: string): string {
  return (USAGE_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

export async function siteUsageSummary(siteId: string, opts: { days?: number } = {}): Promise<UsageSummary> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      action: aiUsage.action,
      /* A request is one thing the client asked for; rows from before the
         column existed count as one each. */
      calls: sql<number>`count(distinct coalesce(${aiUsage.requestId}, ${aiUsage.id}))::int`,
      tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
      lastAt: sql<Date | null>`max(${aiUsage.createdAt})`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.siteId, siteId), gte(aiUsage.createdAt, since)))
    .groupBy(aiUsage.action)
    .orderBy(desc(sql`sum(${aiUsage.totalTokens})`));

  const totalTokens = rows.reduce((s, r) => s + r.tokens, 0);
  const lastAt = rows.reduce<Date | null>((latest, r) => {
    const d = r.lastAt ? new Date(r.lastAt) : null;
    return d && (!latest || d > latest) ? d : latest;
  }, null);

  return {
    since,
    calls: rows.reduce((s, r) => s + r.calls, 0),
    totalTokens,
    credits: creditsFromTokens(totalTokens),
    byAction: rows.map((r) => ({
      action: r.action as UsageAction,
      label: usageActionLabel(r.action),
      calls: r.calls,
      tokens: r.tokens,
      /* Per-line credits are indicative — the total is what counts, and the
         lines may sum to one more than it because each is rounded up. */
      credits: creditsFromTokens(r.tokens),
    })),
    lastAt,
  };
}

export type AgencyUsageSummary = {
  since: Date;
  requests: number;
  totalTokens: number;
  credits: number;
  /** Highest spend first. Sites the agency no longer manages still appear for the period they did. */
  bySite: Array<{ siteId: string; name: string; smbId: string | null; requests: number; tokens: number; credits: number }>;
};

/**
 * What an agency's sites spent, by site.
 *
 * Read by `ai_usage.agency_id`, not by the sites the agency holds today — the
 * column was copied onto each row for exactly this, so a site transferred out
 * mid-month still shows what it spent while it was theirs, and a site
 * transferred in does not bring its history along.
 */
export async function agencyUsageSummary(agencyId: string, opts: { days?: number } = {}): Promise<AgencyUsageSummary> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      siteId: aiUsage.siteId,
      name: sites.name,
      smbId: sites.smbId,
      requests: sql<number>`count(distinct coalesce(${aiUsage.requestId}, ${aiUsage.id}))::int`,
      tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
    })
    .from(aiUsage)
    .innerJoin(sites, eq(sites.id, aiUsage.siteId))
    .where(and(eq(aiUsage.agencyId, agencyId), gte(aiUsage.createdAt, since)))
    .groupBy(aiUsage.siteId, sites.name, sites.smbId)
    .orderBy(desc(sql`sum(${aiUsage.totalTokens})`));

  const totalTokens = rows.reduce((s, r) => s + r.tokens, 0);
  return {
    since,
    requests: rows.reduce((s, r) => s + r.requests, 0),
    totalTokens,
    credits: creditsFromTokens(totalTokens),
    bySite: rows.map((r) => ({ ...r, credits: creditsFromTokens(r.tokens) })),
  };
}

export type PlatformUsageSummary = {
  since: Date;
  requests: number;
  totalTokens: number;
  credits: number;
  /** Highest spend first; sites with no agency are gathered as one "Direct clients" line. */
  byAgency: Array<{ agencyId: string | null; name: string; partnerId: string | null; sites: number; requests: number; tokens: number; credits: number }>;
  /** Which models did the work — the real version of the old illustrative provider mix. */
  byModel: Array<{ model: string; tokens: number; share: number }>;
};

/** Everything the platform spent, for the super admin: by agency, and by model. */
export async function platformUsageSummary(opts: { days?: number } = {}): Promise<PlatformUsageSummary> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [agencyRows, modelRows] = await Promise.all([
    db
      .select({
        agencyId: aiUsage.agencyId,
        name: agencies.name,
        partnerId: agencies.partnerId,
        sites: sql<number>`count(distinct ${aiUsage.siteId})::int`,
        requests: sql<number>`count(distinct coalesce(${aiUsage.requestId}, ${aiUsage.id}))::int`,
        tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
      })
      .from(aiUsage)
      .leftJoin(agencies, eq(agencies.id, aiUsage.agencyId))
      .where(gte(aiUsage.createdAt, since))
      .groupBy(aiUsage.agencyId, agencies.name, agencies.partnerId)
      .orderBy(desc(sql`sum(${aiUsage.totalTokens})`)),
    db
      .select({ model: aiUsage.model, tokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int` })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, since))
      .groupBy(aiUsage.model)
      .orderBy(desc(sql`sum(${aiUsage.totalTokens})`)),
  ]);

  const totalTokens = agencyRows.reduce((s, r) => s + r.tokens, 0);
  return {
    since,
    requests: agencyRows.reduce((s, r) => s + r.requests, 0),
    totalTokens,
    credits: creditsFromTokens(totalTokens),
    byAgency: agencyRows.map((r) => ({
      agencyId: r.agencyId,
      /* An agency deleted since still has a name on its rows' history — "a
         former agency" is truer than a blank, and a null agency is a site the
         platform serves directly. */
      name: r.agencyId ? (r.name ?? "A former agency") : "Direct clients",
      partnerId: r.partnerId ?? null,
      sites: r.sites,
      requests: r.requests,
      tokens: r.tokens,
      credits: creditsFromTokens(r.tokens),
    })),
    byModel: modelRows.map((r) => ({ model: r.model, tokens: r.tokens, share: totalTokens ? r.tokens / totalTokens : 0 })),
  };
}
