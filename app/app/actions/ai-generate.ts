"use server";

import { createClient } from "@/lib/supabase/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { canEditSite } from "@/app/actions/sites";
import { ensureSiteForm } from "@/lib/forms/ensure";
import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { generatePageWithGemini } from "@/lib/ai/generate-page";
import {
  loadBusinessContext,
  photoQueryFor,
  describeBusiness,
  contactFactsFor,
  pinContactFacts,
} from "@/lib/ai/business-context";
import { generateHeroContentWithGemini } from "@/lib/ai/gemini";
import { searchPhoto } from "@/lib/images/pexels";
import { sectionsForPlan } from "@/lib/sections/resolve";
import { planPage, planChrome, type PlannedSection } from "@/lib/sections/page-plan";
import { generateHeroContent, heroContentToSchema } from "@/lib/mock-ai";
import type { FieldSpec } from "@/lib/sections/types";

/** Stable per-prompt spread, so two businesses in one vertical don't collide. */
function seedFrom(prompt: string): number {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) h = (h * 31 + prompt.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** One section node: what gets stored for a header or a footer. */
export type ChromeNode = { id: string; type: string; props: Record<string, unknown> };

export type GeneratedPage = {
  schema: { schemaVersion: string; nodes: Array<Record<string, unknown>> };
  /**
   * The site's header and footer, when this generation established them.
   *
   * Returned as well as stored so the builder can repaint its canvas with the
   * real chrome instead of the placeholder navigation it used to draw.
   */
  chrome: { header: ChromeNode | null; footer: ChromeNode | null };
  /** One line per section built, shown as the build steps in chat. */
  steps: string[];
  /** Set when the page had to be built without the AI, so chat can say so. */
  degraded: string | null;
};

/**
 * Builds a whole page.
 *
 * Replaces generateHeroContentAction, which took a prompt and nothing else and
 * returned a single hero. Two consequences of that, both of which this fixes:
 *
 *   1. The model was handed the user's instruction as the business
 *      description, so "build home page" for a bakery produced copy about
 *      building homepages.
 *   2. The result was one hardcoded HeroSplit, so no prompt could ever produce
 *      a page with more than one section.
 *
 * Access is checked here rather than trusted from the caller: this reads the
 * business record and spends API budget, so it must not be callable for a site
 * the user cannot edit.
 */
export async function generatePageAction(opts: {
  siteId: string;
  slug: string;
  title?: string;
  instruction: string;
}): Promise<GeneratedPage> {
  const { siteId, slug, instruction, title } = opts;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (!(await canEditSite(user.id, siteId))) {
    throw new Error("You don't have access to this site.");
  }

  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  const business = await loadBusinessContext(siteId);
  const settings = await getAiProviderSettings();

  const available = await sectionsForPlan(site?.plan ?? "starter");
  // The client's own words, so an explicit "add a form" is not lost to the slug.
  const plan = planPage(slug, available, instruction);

  /*
   * Header and footer are chosen once and then left alone. Re-picking them on
   * every generation would change the navigation across the whole site because
   * someone regenerated one inner page.
   */
  const chromeSettled = Boolean(site?.headerSchemaJson && site?.footerSchemaJson);
  const chromePlan = chromeSettled ? [] : planChrome(available);

  const pageTitle = title ?? (slug === "home" ? "Home" : slug);

  // No business record and no plan means there is nothing to build against.
  if (!business || plan.length === 0) {
    return degradedHero(instruction, "no sections are available for this site's plan");
  }

  if (settings.activeProvider !== "gemini" || !settings.geminiApiKey) {
    return degradedHero(instruction, "no AI provider is configured");
  }

  let generated;
  try {
    generated = await generatePageWithGemini({
      apiKey: settings.geminiApiKey,
      plan: [...plan, ...chromePlan],
      business,
      instruction,
      pageTitle,
    });
  } catch (err) {
    console.error("Page generation failed, falling back to a single hero:", err);
    return degradedHero(instruction, "the AI provider failed", business.businessName);
  }

  /*
   * Photos are sourced from the business, never from the instruction — the old
   * code searched on what was typed, so "build home page" returned a concrete
   * building. One query per page, reused, so a page costs one stock lookup.
   */
  const photo = await searchPhoto(photoQueryFor(business), seedFrom(business.businessName));

  // Real contact details overwrite whatever the model produced for those
  // fields. Facts we hold beat text we generated, every time.
  const facts = contactFactsFor(business);

  const nodes: Array<Record<string, unknown>> = [];
  const steps: string[] = [];
  const rejected: string[] = [];

  for (const { job, section } of plan) {
    const raw = generated[section.key];
    if (!raw) {
      rejected.push(section.key);
      continue;
    }

    const props = pinContactFacts(
      photo ? withPhoto(raw, section, photo) : raw,
      section.definition.fields,
      facts,
    );

    if (!usable(props, section)) {
      rejected.push(section.key);
      continue;
    }

    nodes.push({ id: `n_${section.key}`, type: section.nodeType, props });
    steps.push(`${job} — ${section.name}`);
  }

  if (rejected.length) {
    console.warn(`Dropped ${rejected.length} unusable section(s): ${rejected.join(", ")}`);
  }

  /*
   * Build and persist the header/footer.
   *
   * Written to the site row, not the page, and only on the generation that
   * establishes them. Export turns these into parts/header.html and
   * parts/footer.html; until this existed, every exported site kept the
   * theme's stub footer — a site title and the words "All rights reserved" —
   * and none of the five footer sections in the library could ever reach one.
   */
  const chrome: GeneratedPage["chrome"] = { header: null, footer: null };
  for (const { job, section } of chromePlan) {
    /*
     * A section with no fields has nothing for the model to return, so an
     * absent key is expected rather than a failure. header-simple is exactly
     * this: its title and menu are WordPress dynamic blocks, so its whole
     * definition is `fields: {}`.
     */
    const hasFields = Object.keys(section.definition.fields).length > 0;
    const raw = generated[section.key] ?? (hasFields ? null : {});
    if (!raw) continue;
    const props = pinContactFacts(raw, section.definition.fields, facts);
    if (!usable(props, section)) continue;

    const node: ChromeNode = { id: `n_${section.key}`, type: section.nodeType, props };
    const placement = section.definition.placement;
    if (placement === "header") chrome.header = node;
    else if (placement === "footer") chrome.footer = node;
    else continue;
    steps.push(`${job} — ${section.name}`);
  }

  if (chrome.header || chrome.footer) {
    await db
      .update(sites)
      .set({
        ...(chrome.header ? { headerSchemaJson: chrome.header } : {}),
        ...(chrome.footer ? { footerSchemaJson: chrome.footer } : {}),
      })
      .where(eq(sites.id, siteId));
  }

  // Already-settled chrome is returned unchanged, so the builder always has
  // something to draw around the page rather than falling back to a placeholder.
  if (!chrome.header) chrome.header = (site?.headerSchemaJson as ChromeNode | null) ?? null;
  if (!chrome.footer) chrome.footer = (site?.footerSchemaJson as ChromeNode | null) ?? null;

  // Every section failing means the response was unusable, not that the page
  // is legitimately empty. A hero is better than a blank canvas.
  if (nodes.length === 0) {
    return degradedHero(instruction, "the AI returned nothing usable", business.businessName);
  }

  /*
   * Put a real form behind any FormEmbed the plan produced.
   *
   * The node is only a pointer; without this the exported Contact page shows an
   * empty space where the form should be. Done after the sections are built so
   * a site that never got a contact slot never gets a form it did not ask for.
   */
  const needsForm = nodes.some((n) => n.type === "FormEmbed" && !(n.props as { formToken?: string })?.formToken);
  if (needsForm && site?.id) {
    const token = await ensureSiteForm(site.id, business.businessName, instruction);
    if (token) {
      for (const node of nodes) {
        if (node.type !== "FormEmbed") continue;
        node.props = { ...(node.props as Record<string, unknown>), formToken: token };
      }
      steps.push("Created a contact form for the enquiries page");
    }
  }

  return {
    schema: { schemaVersion: "1.0", nodes },
    chrome,
    steps,
    degraded: rejected.length
      ? `${rejected.length} section${rejected.length === 1 ? "" : "s"} came back unusable and ${rejected.length === 1 ? "was" : "were"} left out.`
      : null,
  };
}

/**
 * The single-hero path, used whenever a full page cannot be built.
 *
 * Deliberately still produces something rather than throwing: a builder that
 * shows a blank canvas because a key expired is worse than one that shows a
 * hero and says why. The reason is returned so chat can state it plainly
 * instead of implying the page is finished.
 */
async function degradedHero(
  instruction: string,
  reason: string,
  businessName?: string,
): Promise<GeneratedPage> {
  const settings = await getAiProviderSettings();
  const promptForHero = businessName
    ? `${businessName}. ${instruction}`
    : instruction;

  let content = null;
  if (settings.activeProvider === "gemini" && settings.geminiApiKey) {
    try {
      content = await generateHeroContentWithGemini(promptForHero, settings.geminiApiKey);
    } catch {
      // Falls through to the keyword mock below.
    }
  }
  content ??= generateHeroContent(promptForHero);

  const photo = await searchPhoto(businessName ?? instruction, seedFrom(promptForHero));
  if (photo) {
    content = {
      ...content,
      image: {
        url: photo.url,
        alt: photo.alt,
        photographer: photo.photographer,
        photographerUrl: photo.photographerUrl,
      },
    };
  }

  return {
    schema: heroContentToSchema(content) as GeneratedPage["schema"],
    chrome: { header: null, footer: null },
    steps: ["Opening pitch — Hero"],
    degraded: `Only the hero was built, because ${reason}.`,
  };
}

/**
 * Attaches the stock photo to a section that declares a top-level image field.
 *
 * LIMITATION, stated rather than hidden: images nested inside a list — the
 * photo cards, the gallery — are not filled, because each entry needs its OWN
 * subject and one shared query cannot supply that. Those sections are kept out
 * of the default plans for exactly this reason; if one is planned, it renders
 * without photographs rather than with three identical ones.
 */
function withPhoto(
  props: Record<string, unknown>,
  section: PlannedSection["section"],
  photo: { url: string; alt: string; photographer?: string; photographerUrl?: string },
): Record<string, unknown> {
  const imageField = Object.entries(section.definition.fields).find(
    ([, spec]) => (spec as FieldSpec).type === "image",
  );
  if (!imageField) return props;

  return {
    ...props,
    [imageField[0]]: {
      url: photo.url,
      alt: photo.alt,
      ...(photo.photographer ? { photographer: photo.photographer } : {}),
      ...(photo.photographerUrl ? { photographerUrl: photo.photographerUrl } : {}),
    },
  };
}


/**
 * Whether generated props are fit to publish.
 *
 * Two failure modes worth catching, both seen in practice:
 *
 *   - The model echoes the sample. Sample copy is about a fictional florist,
 *     so publishing it would put someone else's business on this site.
 *   - The shape is wrong enough that serializing throws, which would take the
 *     whole page down instead of one section.
 */
function usable(props: Record<string, unknown>, section: PlannedSection["section"]): boolean {
  const def = section.definition;

  let markup: string;
  try {
    markup = def.toGutenberg(props);
  } catch {
    return false;
  }
  if (!markup.trim()) return false;

  // Compared on text, not on the object: a model that reworded one field but
  // copied the rest has still mostly echoed the sample.
  /*
   * A section that declares no fields has no copy to judge — it serializes from
   * dynamic blocks alone. Requiring text here rejected header-simple outright,
   * which would have left every site without a header.
   */
  if (Object.keys(def.fields).length === 0) return true;

  const sampleText = textOf(def.sample as Record<string, unknown>);
  const propsText = textOf(props);
  if (propsText.length === 0) return false;
  if (sampleText.length > 0 && propsText === sampleText) return false;

  return true;
}

/** Every string in an object tree, flattened, for comparison. */
function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join("|");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(textOf)
      .filter(Boolean)
      .join("|");
  }
  return "";
}

/** Kept for callers that only want a business summary, e.g. chat context. */
export async function describeBusinessAction(siteId: string): Promise<string | null> {
  const ctx = await loadBusinessContext(siteId);
  return ctx ? describeBusiness(ctx) : null;
}
