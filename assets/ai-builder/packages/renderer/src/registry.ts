/* ============================================================
   Component registry — the bridge between a schema node's `type`
   string and real code.

   Adding a section means adding one entry here. Everything else
   (AI prompt, editor panel, exporter, fidelity test) reads from
   this map, so nothing else needs to change.
   ============================================================ */

import { HeroSplit } from "./sections/HeroSplit";
import { meta as heroSplitMeta } from "./sections/HeroSplit/schema";
import { toGutenberg as heroSplitToGutenberg } from "./sections/HeroSplit/export";
import { fixture as heroSplitFixture } from "./sections/HeroSplit/fixture";

export interface SectionEntry {
  component: (props: any) => any;
  toGutenberg: (props: any, ctx?: any) => string;
  schema: any;
  aiHint: string;
  category: string;
  /** Props used by the export fidelity test. */
  fixture: any;
  /** Relative path to the section's stylesheet, from src/. */
  stylesheet: string;
}

export const registry: Record<string, SectionEntry> = {
  HeroSplit: {
    component: HeroSplit,
    toGutenberg: heroSplitToGutenberg,
    schema: heroSplitMeta.schema,
    aiHint: heroSplitMeta.aiHint,
    category: heroSplitMeta.category,
    fixture: heroSplitFixture,
    stylesheet: "sections/HeroSplit/styles.css",
  },

  // Next: ServicesGrid, Testimonials, StatsBar, FAQAccordion, …
};

export const sectionNames = Object.keys(registry);

/** Serialized for the Design Agent's prompt. */
export function catalogueForAI() {
  return sectionNames.map((name) => ({
    type: name,
    category: registry[name].category,
    hint: registry[name].aiHint,
  }));
}
