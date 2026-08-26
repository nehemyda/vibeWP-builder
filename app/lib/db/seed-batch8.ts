/**
 * Seeds the default section catalogue. Safe to re-run.
 * Run with: npx tsx lib/db/seed-batch8.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "./index";
import { sections } from "./schema";

const DEFAULT_SECTIONS = [
  {
    key: "hero-split",
    name: "Hero Split",
    description: "Full-width hero with heading, body copy, two CTAs, and a media panel. The only section the builder currently generates.",
    category: "Hero",
    componentType: "HeroSplit",
    sortOrder: 0,
  },
] as const;

async function main() {
  for (const s of DEFAULT_SECTIONS) {
    await db.insert(sections).values(s).onConflictDoNothing();
  }

  console.log("Section catalogue seeded.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
