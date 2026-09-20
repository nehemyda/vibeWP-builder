import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema";
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
