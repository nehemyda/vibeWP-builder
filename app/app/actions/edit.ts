"use server";

import { eq, and } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { sites, sitePages } from "@/lib/db/schema";
import { canEditSite } from "@/app/actions/sites";
import { savePageSchemaAction } from "@/app/actions/pages";
import { getAiProviderSettings } from "@/lib/ai-provider-settings";
import { loadBusinessContext, contactFactsFor } from "@/lib/ai/business-context";
import { generatePageWithGemini } from "@/lib/ai/generate-page";
import { fillSectionImages } from "@/lib/ai/section-images";
import { planEdit } from "@/lib/ai/plan-edit";
import { loadBuilderMessagesAction } from "@/app/actions/builder-chat";
import { applyOp, type EditOp, type PageSchema } from "@/lib/sections/edit-ops";
import { sectionsForPlan } from "@/lib/sections/resolve";
import { getSectionByKey, getSectionByNodeType } from "@/lib/sections";
import { isOptionField } from "@/lib/sections/types";
import { plainRefusal } from "@/lib/ai/refusal";
import { logEdit } from "@/lib/ai/edit-log";
import { ensureSiteForm } from "@/lib/forms/ensure";
import { writeChromeWithHistory } from "@/lib/history/chrome";

/**
 * One targeted change to a page, from a sentence.
 *
 * Replaces routing every edit to a full rebuild. That behaviour was not merely
 * limited, it was untruthful: asked to add a gallery it regenerated the same
 * six sections and reported "Updated your homepage", describing work it had not
 * done. Here, an instruction that cannot be carried out says so.
 */

/**
 * A header or footer, in the shape the builder keeps chrome in.
 *
 * Returned with the result so the canvas can repaint immediately. Chrome lives
 * on the site rather than the page, so nothing the client already refreshes
 * after an edit — the page list, the history — carries it: a swapped header
 * stayed invisible until a reload, which reads as the change not happening.
 */
export type ChromeUpdate = { type: string; props: Record<string, unknown> } | null;

export type EditResult =
  | { ok: true; message: string; regenerate?: false; chrome?: { header: ChromeUpdate; footer: ChromeUpdate } }
  | { ok: true; message: string; regenerate: true }
  | { ok: false; message: string };

export async function applyEditAction(opts: {
  siteId: string;
  slug: string;
  instruction: string;
}): Promise<EditResult> {
  /*
   * Every attempt is recorded, including the ones that fail.
   *
   * Wrapped rather than logged at each return because there are a dozen exits
   * and the ones that matter most for diagnosis are the failures — precisely
   * the ones easiest to forget to instrument.
   */
  let chosenOp: unknown = null;
  const record = (result: EditResult) => {
    void logEdit({
      siteId: opts.siteId,
      slug: opts.slug,
      instruction: opts.instruction,
      op: chosenOp,
      outcome: result.ok ? "ok" : "refused",
      message: result.message,
    });
    return result;
  };

  try {
    return record(await runEdit(opts, (op) => { chosenOp = op; }));
  } catch (err) {
    void logEdit({
      siteId: opts.siteId,
      slug: opts.slug,
      instruction: opts.instruction,
      op: chosenOp,
      outcome: "error",
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
    throw err;
  }
}

async function runEdit(
  opts: { siteId: string; slug: string; instruction: string },
  noteOp: (op: unknown) => void,
): Promise<EditResult> {
  const { siteId, slug, instruction } = opts;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (!(await canEditSite(user.id, siteId))) {
    throw new Error("You don't have access to this site.");
  }

  const settings = await getAiProviderSettings();
  if (settings.activeProvider !== "gemini" || !settings.geminiApiKey) {
    return { ok: false, message: "No AI provider is configured, so I can't make changes yet." };
  }

  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
  const page = await db.query.sitePages.findFirst({
    where: and(eq(sitePages.siteId, siteId), eq(sitePages.slug, slug)),
  });
  if (!page) return { ok: false, message: "That page doesn't exist yet." };

  const business = await loadBusinessContext(siteId);
  if (!business) return { ok: false, message: "This site has no business details yet." };

  const schema = (page.schemaJson ?? { nodes: [] }) as PageSchema;
  const available = await sectionsForPlan(site?.plan ?? "starter");

  let op: EditOp;
  try {
    op = await planEdit({
      apiKey: settings.geminiApiKey,
      instruction,
      schema,
      available,
      chrome: {
        header: (site?.headerSchemaJson as { type?: string } | null)?.type,
        footer: (site?.footerSchemaJson as { type?: string } | null)?.type,
      },
      // The transcript, so a follow-up like "connect the phone number" can be
      // resolved against the button the previous turn created.
      history: (await loadBuilderMessagesAction(siteId)).map((m) => ({
        role: m.role,
        text: m.text,
      })),
    });
  } catch (err) {
    console.error("Edit planning failed:", err);
    return { ok: false, message: "I couldn't work out that change. Try wording it differently." };
  }

  // Logged always: when an edit lands somewhere unexpected, the operation the
  // planner chose is the first thing worth seeing.
  noteOp(op);

  if (op.kind === "regenerate_page") {
    return { ok: true, regenerate: true, message: "" };
  }
  if (op.kind === "unsupported") {
    /*
     * Last line of defence on the wording.
     *
     * The prompt tells the model to write refusals for a business owner and
     * shows it a worked example, and it still answered "The current header
     * design ('HeaderSimple') does not include a button". A prompt is guidance;
     * a client reading their own site's internals is a fact. Node types and
     * registry keys are ours, so they get stripped here regardless.
     */
    return { ok: false, message: plainRefusal(op.reason) };
  }

  /*
   * A header option lives on the site, not the page — the header is a template
   * part shared by every page, so writing it into one page's schema would make
   * it disagree with the rest of the site.
   */
  if (op.kind === "set_option" && site?.headerSchemaJson) {
    const header = site.headerSchemaJson as { type?: string; props?: Record<string, unknown> };
    /*
     * Matched on ANY name the header answers to, not just its node type.
     *
     * The prompt asks for the node type and the model returns the registry key
     * about as often — "make the header sticky" came back as
     * section: "header-simple" against a header stored as "HeaderSimple", which
     * failed this comparison, fell through to the page-level path, and reported
     * that the client had no such section on their page. Accepting every name
     * it legitimately has costs nothing and removes a whole class of near-miss.
     */
    const headerDef = header.type ? getSectionByNodeType(header.type) : undefined;
    const wanted = op.section.trim().toLowerCase();
    const isHeader = [header.type, headerDef?.key, headerDef?.name].some(
      (name) => name?.trim().toLowerCase() === wanted,
    );
    if (header.type && isHeader) {
      const def = getSectionByNodeType(header.type);
      const spec = def?.fields[op.option];
      if (!spec) return { ok: false, message: `The header has no "${op.option}" setting.` };

      const value = op.value.trim().toLowerCase();
      const bool = ["true", "yes", "on", "1"].includes(value)
        ? true
        : ["false", "no", "off", "0"].includes(value)
          ? false
          : undefined;
      if (spec.type === "boolean" && bool === undefined) {
        return { ok: false, message: `"${op.value}" isn't a valid setting for the header.` };
      }

      const updated = {
        ...header,
        props: { ...header.props, [op.option]: spec.type === "boolean" ? bool : op.value },
      } as ChromeUpdate;
      await writeChromeWithHistory({ siteId, userId: user.id, header: updated, reason: instruction });
      return {
        ok: true,
        message: `${spec.label} is now ${spec.type === "boolean" ? (bool ? "on" : "off") : op.value}. Export to update the live site.`,
        chrome: { header: updated, footer: (site?.footerSchemaJson ?? null) as ChromeUpdate },
      };
    }
  }

  /*
   * Rewriting the words inside the header or footer they already have.
   *
   * Kept separate from swap_chrome because it must NOT change which header is
   * in use: someone asking for the phone number on their button is not asking
   * for a different header, and replacing one is how they lost the design they
   * had chosen.
   */
  if (op.kind === "rewrite_chrome") {
    const current = (op.slot === "header" ? site?.headerSchemaJson : site?.footerSchemaJson) as
      | { type?: string; props?: Record<string, unknown> }
      | null;
    if (!current?.type) return { ok: false, message: `This site has no ${op.slot} yet.` };

    const def = getSectionByNodeType(current.type);
    const resolved = available.find((s) => s.key === def?.key);
    if (!resolved) return { ok: false, message: `I can't edit this ${op.slot}.` };

    const editable = Object.entries(resolved.definition.fields).filter(([, f]) => !isOptionField(f));
    if (editable.length === 0) {
      return {
        ok: false,
        message: `Your ${op.slot} has no wording to change — it shows your business name and menu, both of which come from your site settings.`,
      };
    }

    let props: Record<string, unknown>;
    try {
      const written = await generatePageWithGemini({
        apiKey: settings.geminiApiKey,
        plan: [{ job: `The site's ${op.slot}`, section: resolved }],
        business,
        instruction: op.instruction,
        pageTitle: page.title ?? slug,
      });
      props = written[resolved.key] ?? {};
    } catch (err) {
      console.error("Chrome rewrite failed:", err);
      return { ok: false, message: `I couldn't rewrite the ${op.slot}. Try again in a moment.` };
    }

    // Settings and anything the rewrite left untouched stay as they were.
    const merged = { ...(current.props ?? {}), ...props };
    for (const [name, spec] of Object.entries(resolved.definition.fields)) {
      if (isOptionField(spec) && current.props && name in current.props) {
        merged[name] = current.props[name];
      }
    }

    const next = { type: current.type, props: merged };
    await writeChromeWithHistory({
      siteId,
      userId: user.id,
      ...(op.slot === "header" ? { header: next } : { footer: next }),
      reason: instruction,
    });

    const other = (op.slot === "header" ? site?.footerSchemaJson : site?.headerSchemaJson) as ChromeUpdate;
    return {
      ok: true,
      message: `Updated your ${op.slot}. Export to update the live site.`,
      chrome: op.slot === "header" ? { header: next, footer: other } : { header: other, footer: next },
    };
  }

  /*
   * Swapping the header or footer.
   *
   * Handled here rather than in applyOp, for the same reason set_option on the
   * header is: chrome lives on the SITE, not the page. Writing it into one
   * page's schema would give that page a different header from every other,
   * which is the one thing a template part exists to prevent.
   */
  if (op.kind === "swap_chrome") {
    const resolved = available.find((s) => s.key === op.section);
    if (!resolved || resolved.definition.placement !== op.slot) {
      return { ok: false, message: `I don't have a ${op.slot} like that to switch to.` };
    }

    const current = (op.slot === "header" ? site?.headerSchemaJson : site?.footerSchemaJson) as
      | { type?: string; props?: Record<string, unknown> }
      | null;

    if (current?.type === resolved.definition.nodeType) {
      return { ok: false, message: `Your ${op.slot} is already the ${resolved.name.toLowerCase()}.` };
    }

    let props: Record<string, unknown> = {};
    const needsCopy = Object.values(resolved.definition.fields).some((f) => !isOptionField(f));
    if (needsCopy) {
      try {
        const written = await generatePageWithGemini({
          apiKey: settings.geminiApiKey,
          plan: [{ job: `The site's ${op.slot}`, section: resolved }],
          business,
          instruction,
          pageTitle: page.title ?? slug,
        });
        props = written[resolved.key] ?? {};
      } catch (err) {
        console.error("Chrome generation failed:", err);
        return { ok: false, message: `I couldn't write the new ${op.slot}. Try again in a moment.` };
      }
    }

    /*
     * Settings the client already chose are carried across.
     *
     * Someone who turned the sticky header off and then asks for a button is
     * asking for a button, not for their scroll behaviour to come back. Only
     * option fields carry — content belongs to the header that wrote it.
     */
    for (const [name, spec] of Object.entries(resolved.definition.fields)) {
      if (isOptionField(spec) && current?.props && name in current.props) {
        props[name] = current.props[name];
      }
    }

    // Real contact details beat anything written about them.
    const facts = contactFactsFor(business);
    for (const field of Object.keys(facts)) {
      if (field in resolved.definition.fields) props[field] = `{{${field}}}`;
    }

    const next = { type: resolved.definition.nodeType, props };
    await writeChromeWithHistory({
      siteId,
      userId: user.id,
      ...(op.slot === "header" ? { header: next } : { footer: next }),
      reason: instruction,
    });

    const otherSlot = (op.slot === "header" ? site?.footerSchemaJson : site?.headerSchemaJson) as ChromeUpdate;
    return {
      ok: true,
      message: `Your ${op.slot} is now the ${resolved.name.toLowerCase()}. Export to update the live site.`,
      chrome:
        op.slot === "header"
          ? { header: next, footer: otherSlot }
          : { header: otherSlot, footer: next },
    };
  }

  /*
   * Changing how many entries a section holds.
   *
   * Handled before the generic paths because it is neither adding a section nor
   * rewriting one: the heading, intro and settings are kept exactly as they are
   * and only the repeating field is rewritten at the new length.
   */
  if (op.kind === "set_items") {
    const nodes = [...(schema.nodes ?? [])];
    const at = nodes.findIndex((n) => {
      const def = getSectionByNodeType(n.type);
      const headingProp = (n.props as Record<string, unknown> | undefined)?.heading;
      const want = op.section.trim().toLowerCase();
      return [n.type, def?.key, def?.name, typeof headingProp === "string" ? headingProp : undefined]
        .some((name) => name?.trim().toLowerCase() === want);
    });
    if (at < 0) return { ok: false, message: `I couldn't find a "${op.section}" section on this page.` };

    const def = getSectionByNodeType(nodes[at].type);
    const resolved = available.find((s) => s.key === def?.key);
    const listField = resolved
      ? Object.entries(resolved.definition.fields).find(([, f]) => f.type === "list")?.[0]
      : undefined;
    if (!resolved || !listField) {
      return { ok: false, message: `The ${def?.name ?? "section"} isn't a list, so it has no number of entries to set.` };
    }

    /*
     * Capped. Each entry costs a stock-photo lookup, so an instruction of
     * "200 photos" would fire 200 requests and exhaust the hourly quota for
     * every other site on the platform.
     */
    const count = Math.max(1, Math.min(24, Math.round(op.count)));
    if (!Number.isFinite(count)) return { ok: false, message: "Tell me how many you'd like." };

    let written;
    try {
      written = await generatePageWithGemini({
        apiKey: settings.geminiApiKey,
        plan: [{ job: "The requested section", section: resolved }],
        business,
        instruction: `${instruction}. Produce exactly ${count} entries for "${listField}".`,
        pageTitle: page.title ?? slug,
      });
    } catch (err) {
      console.error("set_items generation failed:", err);
      return { ok: false, message: "I couldn't write those entries. Try again in a moment." };
    }

    const fresh = written[resolved.key];
    const items = Array.isArray(fresh?.[listField]) ? (fresh![listField] as unknown[]) : [];
    if (items.length === 0) return { ok: false, message: "I couldn't write those entries." };

    // Only the list changes; everything the client already has stays.
    const merged = await fillSectionImages({
      section: resolved.definition,
      props: { ...(nodes[at].props ?? {}), [listField]: items.slice(0, count) },
      business,
    });

    nodes[at] = { ...nodes[at], props: merged };
    await savePageSchemaAction({
      siteId,
      slug,
      schema: { ...schema, nodes } as Record<string, unknown>,
      reason: instruction,
    });

    const actual = (merged[listField] as unknown[]).length;
    return {
      ok: true,
      message: `The ${resolved.name} now has ${actual} ${actual === 1 ? "entry" : "entries"}. Say "undo" to put it back.`,
    };
  }

  // Content is only needed when a section is being added or rewritten.
  let newProps: Record<string, unknown> | undefined;

  if (op.kind === "add_section" || op.kind === "rewrite_section") {
    const key = op.kind === "add_section" ? op.section : (getSectionByNodeType(op.section)?.key ?? op.section);
    const resolved = available.find((s) => s.key === key);
    if (!resolved) return { ok: false, message: `There's no "${op.section}" section available.` };

    try {
      const written = await generatePageWithGemini({
        apiKey: settings.geminiApiKey,
        plan: [{ job: "The requested section", section: resolved }],
        business,
        instruction:
          op.kind === "add_section"
            ? `${instruction}${op.itemCount ? ` Produce exactly ${op.itemCount} entries.` : ""}`
            : op.instruction,
        pageTitle: page.title ?? slug,
      });
      newProps = written[resolved.key];
    } catch (err) {
      console.error("Section content generation failed:", err);
      return { ok: false, message: "I couldn't write that section. Try again in a moment." };
    }
    if (!newProps) return { ok: false, message: "I couldn't write that section." };

    // Photographs, including one per list entry where the section has them.
    newProps = await fillSectionImages({
      section: resolved.definition,
      props: newProps,
      business,
    });

    // Real contact details beat anything written about them.
    const facts = contactFactsFor(business);
    for (const field of Object.keys(facts)) {
      if (field in resolved.definition.fields) {
        newProps[field] = `{{${field}}}`;
      }
    }
    /*
     * A form added by chat needs a real form behind it.
     *
     * add_section produces a FormEmbed with an empty token, which renders as
     * nothing on the live site — the same dead pointer generation had to solve.
     * Reuses the site's existing form, so asking for a form on a second page
     * does not create a second inbox.
     */
    if (op.kind === "add_section" && resolved.definition.nodeType === "FormEmbed") {
      const token = await ensureSiteForm(siteId, business.businessName);
      if (token) newProps.formToken = token;
    }

    if (op.kind === "add_section" && op.columns && "columns" in resolved.definition.fields) {
      newProps.columns = op.columns;
    }
  }

  let next: PageSchema;
  let describe: string;

  if (op.kind === "rewrite_section") {
    const nodes = [...(schema.nodes ?? [])];
    const at = nodes.findIndex(
      (n) => n.type?.toLowerCase() === op.section.toLowerCase(),
    );
    if (at < 0) return { ok: false, message: `There's no ${op.section} on this page.` };
    nodes[at] = { ...nodes[at], props: newProps ?? nodes[at].props };
    next = { ...schema, nodes };
    describe = `Rewrote the ${getSectionByNodeType(nodes[at].type)?.name ?? "section"}.`;
  } else {
    const result = applyOp(schema, op, newProps);
    if (!result.ok) // Applied-op failures reach the client too, so they are cleaned like
    // any other refusal — this is where "ContactBlock" leaked through.
    return { ok: false, message: plainRefusal(result.error) };
    next = result.schema;
    describe = result.describe;
  }

  await savePageSchemaAction({
    siteId,
    slug,
    schema: next as Record<string, unknown>,
    reason: instruction,
  });

  const count = next.nodes?.length ?? 0;
  return {
    ok: true,
    message: `${describe} The page now has ${count} section${count === 1 ? "" : "s"}. Say "undo" to put it back.`,
  };
}

/** Re-exported for the section catalogue shown in the planner prompt. */
export async function sectionNameForKey(key: string): Promise<string | null> {
  return getSectionByKey(key)?.name ?? null;
}
