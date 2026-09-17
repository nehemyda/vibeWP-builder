import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { subdomainFrom } from "./hosting";

/**
 * An available address for a site, or null.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT IS NOT IN hosting.ts, AND NOT IN wordpress.ts EITHER
 *
 * hosting.ts is imported by proxy.ts, which runs on every request — pulling a
 * database client in there would put Drizzle in the proxy's bundle to answer a
 * question the proxy never asks.
 *
 * wordpress.ts is "use server", where every export becomes an endpoint a
 * browser can call. This one takes a whole site row, so exporting it from
 * there would let a caller hand it any row they liked.
 *
 * So it lives here: one module, both callers, neither consequence.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Tries the business name first because that is the address its owner would
 * expect, then numbered variants, then the SMB ID — unique by construction and
 * therefore the answer that cannot fail. Uniqueness is enforced by the column,
 * so a losing race surfaces as an error rather than as two sites on one host.
 */
export async function claimVibeSubdomain(
  site: typeof sites.$inferSelect,
): Promise<string | null> {
  const base = subdomainFrom(site.name);
  const candidates = base ? [base, `${base}-2`, `${base}-3`, `${base}-4`, `${base}-5`] : [];
  if (site.smbId) candidates.push(site.smbId.toLowerCase());

  for (const candidate of candidates) {
    const taken = await db.query.sites.findFirst({
      where: eq(sites.vibeSubdomain, candidate),
    });
    if (!taken) return candidate;
  }
  return null;
}
