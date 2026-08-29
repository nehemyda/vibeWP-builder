import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sections } from "@/lib/db/schema";
import { SECTIONS, getSectionByKey } from "./index";
import type { SectionDefinition } from "./types";

/**
 * A section as the platform actually sees it: the code definition with the
 * admin's overlay applied.
 *
 * The registry is the source of truth for what EXISTS. The database row only
 * adjusts policy — name, category, order, availability, prompt. This asymmetry
 * is the whole point of the chosen model, and it is enforced here rather than
 * left to each caller.
 */
export type ResolvedSection = {
  key: string;
  nodeType: string;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  sortOrder: number;
  /** The prompt in force: the admin's override if set, else the code default. */
  aiPrompt: string;
  aiPromptOverride: string | null;
  previewImageUrl: string | null;
  allowedPlans: string[];
  /** The code definition, for previews and field lists. */
  definition: SectionDefinition<Record<string, unknown>>;
  /** True when no admin row exists yet — reconcile() will create one. */
  needsRow: boolean;
};

/**
 * An admin row whose key no longer matches any section in code.
 *
 * Surfaced rather than hidden: it means a section was renamed or removed while
 * its policy row survived, and any page still referencing it will silently fail
 * to render that section.
 */
export type OrphanRow = { id: string; key: string; name: string; componentType: string };

export async function listSections(): Promise<{
  resolved: ResolvedSection[];
  orphans: OrphanRow[];
}> {
  const rows = await db.select().from(sections);
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const resolved: ResolvedSection[] = SECTIONS.map((def) => {
    const row = byKey.get(def.key);
    return {
      key: def.key,
      nodeType: def.nodeType,
      // Admin overrides win for presentation; code supplies the fallback so a
      // brand-new section is never nameless before anyone has touched it.
      name: row?.name?.trim() || def.name,
      description: row?.description?.trim() || def.description,
      category: row?.category?.trim() || def.category,
      isActive: row?.isActive ?? true,
      sortOrder: row?.sortOrder ?? SECTIONS.indexOf(def),
      aiPrompt: row?.aiPromptOverride?.trim() || def.aiPrompt,
      aiPromptOverride: row?.aiPromptOverride ?? null,
      previewImageUrl: row?.previewImageUrl ?? null,
      allowedPlans: row?.allowedPlans ?? [],
      definition: def as SectionDefinition<Record<string, unknown>>,
      needsRow: !row,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const orphans = rows
    .filter((r) => !getSectionByKey(r.key))
    .map((r) => ({ id: r.id, key: r.key, name: r.name, componentType: r.componentType }));

  return { resolved, orphans };
}

export async function resolveSection(key: string): Promise<ResolvedSection | null> {
  const { resolved } = await listSections();
  return resolved.find((s) => s.key === key) ?? null;
}

/**
 * Creates the missing policy rows for sections that exist in code.
 *
 * Called when the library is opened, so deploying a new section makes it
 * manageable without a manual step. Deliberately never deletes: an orphan row
 * may hold an override worth keeping, and removing data as a side effect of
 * viewing a page would be the wrong trade.
 */
export async function reconcileSections(): Promise<number> {
  const rows = await db.select({ key: sections.key }).from(sections);
  const known = new Set(rows.map((r) => r.key));

  const missing = SECTIONS.filter((s) => !known.has(s.key));
  if (missing.length === 0) return 0;

  /*
   * Deliberately does NOT copy the description.
   *
   * Copying it froze it: the row's value wins over the code's (that is what an
   * overlay is for), so a description edited in code never reached the library
   * again. HeroSplit went on advertising itself as "the only section the
   * builder currently generates" long after a page grew to six sections —
   * a false statement in the admin UI that no code change could correct.
   *
   * Left null, code supplies it until an admin deliberately writes one.
   *
   * `name` and `category` are still copied because both columns are NOT NULL.
   * They carry the same latent staleness, which is worth fixing when either is
   * next changed in code — noted rather than silently accepted.
   */
  await db.insert(sections).values(
    missing.map((s, i) => ({
      key: s.key,
      name: s.name,
      category: s.category,
      componentType: s.nodeType,
      sortOrder: SECTIONS.indexOf(s) + i,
    })),
  );

  return missing.length;
}

/** Sections a given plan may use, for the builder's insert menu. */
export async function sectionsForPlan(plan: string): Promise<ResolvedSection[]> {
  const { resolved } = await listSections();
  return resolved.filter(
    (s) => s.isActive && (s.allowedPlans.length === 0 || s.allowedPlans.includes(plan)),
  );
}

/** Re-exported so callers don't need to know where the table lives. */
export async function setSectionActive(key: string, isActive: boolean) {
  await db.update(sections).set({ isActive, updatedAt: new Date() }).where(eq(sections.key, key));
}
