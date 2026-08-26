/**
 * One-off: assigns partnerId/smbId to any agency/site created before that
 * migration landed. Safe to re-run — only touches rows where the field is
 * still null. Run with: npx tsx lib/db/backfill-ids.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, isNull } from "drizzle-orm";
import { db } from "./index";
import { agencies, sites } from "./schema";
import { generatePartnerId, generateSmbId } from "../ids";

async function main() {
  const agenciesWithoutId = await db.query.agencies.findMany({
    where: isNull(agencies.partnerId),
  });
  for (const agency of agenciesWithoutId) {
    const partnerId = await generatePartnerId();
    await db.update(agencies).set({ partnerId }).where(eq(agencies.id, agency.id));
    console.log(`agencies.${agency.id} -> ${partnerId}`);
  }

  const sitesWithoutId = await db.query.sites.findMany({
    where: isNull(sites.smbId),
  });
  for (const site of sitesWithoutId) {
    const smbId = await generateSmbId();
    await db.update(sites).set({ smbId }).where(eq(sites.id, site.id));
    console.log(`sites.${site.id} -> ${smbId}`);
  }

  console.log("Backfill complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
