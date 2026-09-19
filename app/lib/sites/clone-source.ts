import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites, sitePages } from "@/lib/db/schema";

/**
 * The site a new one may be started from, or null.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS CHECKED HERE AND NOT TRUSTED FROM THE FORM
 *
 * The picker only lists sites the creator can see, and a <select> is not a
 * guarantee of anything — the value arrives in a POST and can say whatever the
 * sender likes. An unchecked SMB ID would let one agency start a site from
 * another agency's, and while a clone copies no words, which sections an
 * agency chose for a client is still a description of that client's site.
 *
 * `agencyId` null means an admin, who may start from any site. Passing an
 * agency's id restricts it to that agency's own, which is the reseller
 * boundary every other query here keeps.
 *
 * A deleted site is refused as well. It is soft-deleted and still readable,
 * but it is not something anyone should be building new work from.
 * ─────────────────────────────────────────────────────────────────────
 */
export async function resolveCloneSource(
  smbId: string | null | undefined,
  opts: { agencyId?: string | null } = {},
): Promise<string | null> {
  const wanted = (smbId ?? "").trim();
  if (!wanted) return null;

  const source = await db.query.sites.findFirst({
    where: and(eq(sites.smbId, wanted), isNull(sites.deletedAt)),
  });
  if (!source) return null;

  if (opts.agencyId && source.agencyId !== opts.agencyId) return null;

  return source.id;
}

/**
 * Sites that can be offered as a starting point.
 *
 * Only ones with pages worth copying the shape of — a site nobody has built
 * yet has no structure to lend, and offering it would produce a clone
 * indistinguishable from a blank site while implying otherwise.
 */
export async function clonableSites(opts: { agencyId?: string | null } = {}) {
  const rows = await db.query.sites.findMany({
    where: opts.agencyId
      ? and(eq(sites.agencyId, opts.agencyId), isNull(sites.deletedAt))
      : isNull(sites.deletedAt),
    columns: { id: true, smbId: true, name: true, plan: true, mode: true },
  });

  /* Counted in one query rather than per site: this renders on a form, and a
     query per row is how a picker becomes the slowest thing on the page. */
  const counts = await db
    .select({ siteId: sitePages.siteId, n: count() })
    .from(sitePages)
    .groupBy(sitePages.siteId);
  const pageCount = new Map(counts.map((c) => [c.siteId, Number(c.n)]));

  return rows
    .filter((s) => s.smbId && (pageCount.get(s.id) ?? 0) > 0)
    .map((s) => ({ ...s, pageCount: pageCount.get(s.id) ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
