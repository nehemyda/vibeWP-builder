import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { smtpSettings, sites } from "@/lib/db/schema";

/**
 * Which mail account a site's notifications go out through.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SITE, THEN AGENCY, THEN THE PLATFORM
 *
 * Most sites will never configure SMTP and should still send, so the chain
 * falls back rather than failing. An agency that has set up its own account
 * wants its clients' mail sent through it; a client who has set up theirs wants
 * their own. The platform's is the floor, not the default.
 *
 * A row counts only if it has a host AND a from address: a half-filled record
 * at one level would otherwise shadow a working one above it, and the failure
 * would read as "email is broken" rather than "this account is incomplete".
 */
export type ResolvedSmtp = {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  fromEmail: string;
  fromName: string;
  secure: boolean;
  /** Which level supplied it, so the UI can say so honestly. */
  level: "site" | "agency" | "global";
};

function usable(
  row: typeof smtpSettings.$inferSelect | undefined,
  level: ResolvedSmtp["level"],
): ResolvedSmtp | null {
  if (!row?.host || !row.fromEmail) return null;
  return {
    host: row.host,
    port: row.port,
    username: row.username,
    password: row.password,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    secure: row.secure,
    level,
  };
}

export async function resolveSmtpForSite(siteId: string): Promise<ResolvedSmtp | null> {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });

  const own = await db.query.smtpSettings.findFirst({
    where: and(eq(smtpSettings.scope, "site"), eq(smtpSettings.siteId, siteId)),
  });
  const atSite = usable(own, "site");
  if (atSite) return atSite;

  if (site?.agencyId) {
    const agency = await db.query.smtpSettings.findFirst({
      where: and(eq(smtpSettings.scope, "agency"), eq(smtpSettings.agencyId, site.agencyId)),
    });
    const atAgency = usable(agency, "agency");
    if (atAgency) return atAgency;
  }

  const global = await db.query.smtpSettings.findFirst({ where: eq(smtpSettings.scope, "global") });
  return usable(global, "global");
}
