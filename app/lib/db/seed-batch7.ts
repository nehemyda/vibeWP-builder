/**
 * Seeds the default plan catalogue and the single platform_settings row.
 * Safe to re-run. Run with: npx tsx lib/db/seed-batch7.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "./index";
import { plans, platformSettings } from "./schema";

const DEFAULT_PLANS = [
  {
    key: "starter",
    name: "Starter",
    priceMonthlyCents: 0,
    features: ["1 site", "Mock AI generation", "Community support"],
    siteLimit: 1,
    seatLimit: 1,
    sortOrder: 0,
  },
  {
    key: "growth",
    name: "Growth",
    priceMonthlyCents: 4900,
    features: ["10 sites", "Real AI generation", "Email support", "Custom domains"],
    siteLimit: 10,
    seatLimit: 3,
    sortOrder: 1,
  },
  {
    key: "scale",
    name: "Scale",
    priceMonthlyCents: 14900,
    features: ["50 sites", "Real AI generation", "Priority support", "Custom domains", "Team roles"],
    siteLimit: 50,
    seatLimit: 10,
    sortOrder: 2,
  },
  {
    key: "agency",
    name: "Agency",
    priceMonthlyCents: 39900,
    features: ["Unlimited sites", "Real AI generation", "Dedicated support", "White-label", "Unlimited team seats"],
    siteLimit: null,
    seatLimit: null,
    sortOrder: 3,
  },
] as const;

async function main() {
  for (const p of DEFAULT_PLANS) {
    await db.insert(plans).values({ ...p, features: [...p.features] }).onConflictDoNothing();
  }

  const existing = await db.query.platformSettings.findFirst();
  if (!existing) {
    await db.insert(platformSettings).values({});
  }

  console.log("Batch 7 seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
