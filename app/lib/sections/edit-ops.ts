import { getSectionByKey, getSectionByNodeType } from "./index";
import { isOptionField } from "./types";

/**
 * Structural edits to a page, as data.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY OPERATIONS AND NOT "REGENERATE WITH A DIFFERENT PROMPT"
 *
 * Chat used to route every edit to a full rebuild. Asked to "create a gallery
 * above the testimonials" it rewrote the whole page, produced the same six
 * sections, and reported "Updated your homepage" — a change that never
 * happened, described as though it had.
 *
 * An operation names exactly what to do, so the model's job is to choose an
 * action rather than to rewrite a page and hope the difference lands. Two
 * consequences worth having:
 *
 *   - Everything else on the page is untouched, including copy the client
 *     edited by hand.
 *   - "I could not do that" becomes representable. A rebuild can only ever
 *     succeed; `unsupported` can honestly fail.
 *
 * Applying is pure and lives here so it can be tested without a model, a
 * database or a network.
 */

export type EditOp =
  | {
      kind: "add_section";
      /** Registry key, e.g. "content-gallery". */
      section: string;
      /** Place before/after the node with this type, e.g. "Testimonials". */
      before?: string;
      after?: string;
      position?: "start" | "end";
      /** For list sections: how many entries the client asked for. */
      itemCount?: number;
      /** For sections with a columns option. */
      columns?: string;
    }
  | { kind: "remove_section"; section: string }
  | { kind: "move_section"; section: string; before?: string; after?: string }
  | { kind: "set_option"; section: string; option: string; value: string }
  /**
   * How many entries a repeating section holds — photos in a gallery, rows in
   * a services list. Separate from set_option because the count is not a
   * setting: changing it means WRITING that many entries, which needs a model
   * and a photo for each. set_option tried to serve this and simply
   * overwrote the list with the number.
   */
  | { kind: "set_items"; section: string; count: number }
  /**
   * Swaps the site's header or footer for a different one.
   *
   * "Add a CTA button to the header" has no home among the operations above.
   * It is not add_section — the header is not on the page, it is a template
   * part shared by every page. It is not set_option — a button is content, and
   * a header that has no button has nowhere to put one. What it actually means
   * is "use the header that HAS a button", which is a different section from
   * the registry, so that is what this expresses.
   *
   * Without it the planner had to answer `unsupported` for every request to
   * change the header beyond its sticky setting, which is most of them.
   */
  | { kind: "swap_chrome"; slot: "header" | "footer"; section: string }
  /**
   * Changes the WORDS in the header or footer, keeping the same one.
   *
   * "Make the header button show the phone number" is not a swap — the header
   * they want is the one they already have, with different text on its button.
   * Without this the planner had only swap_chrome for any header request, so it
   * answered a content change by replacing the entire header with a different
   * design, which is how someone asking for a phone number on a button ended up
   * with a contact bar they never asked for.
   */
  | { kind: "rewrite_chrome"; slot: "header" | "footer"; instruction: string }
  /**
   * Changes a field on the form this page shows.
   *
   * The form is not a section — it is a definition in Leads & forms, embedded
   * here — so none of the section operations reach it, and every request to add
   * a question or widen a field was refused with "edit it in the form builder".
   * Accurate, and a dead end: the client is looking at the form, describing the
   * change, and being sent somewhere else to make it.
   */
  | {
      kind: "edit_form";
      action: "add_field" | "remove_field" | "set_width" | "set_required" | "rename_field";
      /** Which field, by its label or its stored name. */
      field?: string;
      label?: string;
      fieldType?: string;
      /** "third" | "half" | "two-thirds" | "full", or a number of twelfths. */
      width?: string;
      required?: string;
    }
  /**
   * Replaces one page section's DESIGN, keeping its content.
   *
   * The gap the other operations left. Asked for a different-looking hero, the
   * planner could only rewrite the copy of the one already there
   * (rewrite_section), change a setting it happens to have (set_option), or
   * throw it away and generate a new one (remove + add) — which loses whatever
   * the client edited by hand. None of those is "same words, different
   * layout", which is what someone means when they say the section looks wrong.
   *
   * Note this INVERTS swap_chrome's policy. A header swap deliberately
   * discards its copy, because a header that has no button has nowhere to put
   * one and the words belonged to the design that wrote them. Here carrying
   * the content across is the entire point, which is why lib/sections/carry-props.ts
   * exists and why it is the largest part of this feature.
   */
  | {
      kind: "swap_section";
      /** The section on the page, by node type, key, name or its own heading. */
      section: string;
      /** Registry key of the design to use instead, e.g. "hero-centered". */
      design: string;
    }
  | { kind: "rewrite_section"; section: string; instruction: string }
  | { kind: "regenerate_page" }
  | { kind: "unsupported"; reason: string };

export type SchemaNode = { id?: string; type?: string; props?: Record<string, unknown> };
export type PageSchema = { schemaVersion?: string; nodes?: SchemaNode[] };

/**
 * Finds a node the client referred to. -1 when absent.
 *
 * Matches on ALL the names a section answers to: its node type, its registry
 * key, its display name, and — the one that matters — its own heading.
 *
 * Being strict here cost a real edit. Asked to put a gallery "above the What
 * our customers say", the planner named the anchor by that heading, the
 * matcher only compared node types, found nothing, and quietly appended the
 * gallery to the end of the page instead. A client refers to a section by what
 * it SAYS; requiring them to know it is called `Testimonials` is requiring them
 * to know our internals.
 */
export function indexOfSection(nodes: SchemaNode[], ref: string | undefined): number {
  if (!ref) return -1;
  // Quotes are stripped because the instruction usually carried them and the
  // model tends to hand them back.
  const wanted = ref.trim().toLowerCase().replace(/^["“”']|["“”']$/g, "");
  if (!wanted) return -1;

  /*
   * The reference may be COMPOUND.
   *
   * Asked to place something, the planner returned
   * `ContactBlock "Visit Our Bakery in Bath"` — the node type and the heading
   * joined into one string. Compared whole, that matched nothing, and the
   * client was told their own page had no such section. Splitting on the quote
   * lets either half identify the node, which is what the model was expressing.
   */
  const candidates = [wanted, ...wanted.split(/["“”']/).map((part) => part.trim())]
    .map((part) => part.replace(/^["“”']|["“”']$/g, "").trim())
    .filter(Boolean);

  return nodes.findIndex((n) => {
    const def = getSectionByNodeType(n.type);
    const heading = (n.props as Record<string, unknown> | undefined)?.heading;
    const names = [
      n.type,
      def?.key,
      def?.name,
      typeof heading === "string" ? heading : undefined,
    ];
    return names.some((name) => {
      const lower = name?.trim().toLowerCase();
      return lower ? candidates.includes(lower) : false;
    });
  });
}

export type ApplyResult =
  | { ok: true; schema: PageSchema; describe: string }
  | { ok: false; error: string };

/**
 * Applies one operation.
 *
 * Content for a newly added section is NOT written here — this only decides
 * shape. The caller generates the copy, because that needs a model and this
 * has to stay pure.
 */
export function applyOp(
  schema: PageSchema,
  op: EditOp,
  /** Props for a section being added, already generated by the caller. */
  newProps?: Record<string, unknown>,
): ApplyResult {
  const nodes = [...(schema.nodes ?? [])];

  switch (op.kind) {
    case "add_section": {
      const section = getSectionByKey(op.section) ?? getSectionByNodeType(op.section);
      if (!section) return { ok: false, error: `There's no "${op.section}" section.` };
      if (section.placement && section.placement !== "page") {
        return {
          ok: false,
          error: `The ${section.name} is part of the site's header or footer, not the page.`,
        };
      }

      const node: SchemaNode = {
        id: `n_${section.key}_${nodes.length}`,
        type: section.nodeType,
        props: newProps ?? {},
      };

      let at = nodes.length;
      if (op.position === "start") at = 0;
      const beforeAt = indexOfSection(nodes, op.before);
      const afterAt = indexOfSection(nodes, op.after);
      if (beforeAt >= 0) at = beforeAt;
      else if (afterAt >= 0) at = afterAt + 1;

      /*
       * A position was asked for and could not be found. Appending anyway is
       * how "above the testimonials" became "at the end" while still reporting
       * success — refuse instead, so the client can name it differently.
       */
      const anchor = op.before ?? op.after;
      if (anchor && beforeAt < 0 && afterAt < 0) {
        return { ok: false, error: `I couldn't find a "${anchor}" section to place it against.` };
      }

      nodes.splice(at, 0, node);

      const where =
        beforeAt >= 0 ? `above the ${label(op.before)}` : afterAt >= 0 ? `below the ${label(op.after)}` : "at the end";
      return {
        ok: true,
        schema: { ...schema, schemaVersion: schema.schemaVersion ?? "1.0", nodes },
        describe: `Added the ${section.name} ${where}.`,
      };
    }

    case "swap_section": {
      const at = indexOfSection(nodes, op.section);
      if (at < 0) return { ok: false, error: `There's no ${label(op.section)} on this page.` };

      const design = getSectionByKey(op.design) ?? getSectionByNodeType(op.design);
      if (!design) return { ok: false, error: `There's no "${op.design}" design.` };
      if (design.placement && design.placement !== "page") {
        return {
          ok: false,
          error: `The ${design.name} belongs in the site's header or footer, not on the page.`,
        };
      }

      const previous = getSectionByNodeType(nodes[at].type);
      if (nodes[at].type === design.nodeType) {
        return { ok: false, error: `That section is already the ${design.name.toLowerCase()}.` };
      }

      /*
       * A new id, because it encodes the design and this is a different one.
       * Nothing correlates nodes across saves — revisions snapshot the whole
       * schema — so keeping the old id would only preserve a name that lies.
       */
      nodes[at] = { id: `n_${design.key}_${at}`, type: design.nodeType, props: newProps ?? {} };

      return {
        ok: true,
        schema: { ...schema, nodes },
        describe: `Changed the ${previous?.name ?? "section"} to the ${design.name}.`,
      };
    }

    case "remove_section": {
      const at = indexOfSection(nodes, op.section);
      if (at < 0) return { ok: false, error: `There's no ${label(op.section)} on this page.` };
      const [gone] = nodes.splice(at, 1);
      return {
        ok: true,
        schema: { ...schema, nodes },
        describe: `Removed the ${getSectionByNodeType(gone.type)?.name ?? "section"}.`,
      };
    }

    case "move_section": {
      const at = indexOfSection(nodes, op.section);
      if (at < 0) return { ok: false, error: `There's no ${label(op.section)} on this page.` };
      const [moving] = nodes.splice(at, 1);

      let to = nodes.length;
      const beforeAt = indexOfSection(nodes, op.before);
      const afterAt = indexOfSection(nodes, op.after);
      if (beforeAt >= 0) to = beforeAt;
      else if (afterAt >= 0) to = afterAt + 1;

      const anchor = op.before ?? op.after;
      if (anchor && beforeAt < 0 && afterAt < 0) {
        // Put it back rather than dumping it at the end.
        nodes.splice(at, 0, moving);
        return { ok: false, error: `I couldn't find a "${anchor}" section to move it against.` };
      }
      nodes.splice(to, 0, moving);

      return {
        ok: true,
        schema: { ...schema, nodes },
        describe: `Moved the ${getSectionByNodeType(moving.type)?.name ?? "section"}.`,
      };
    }

    case "set_option": {
      const at = indexOfSection(nodes, op.section);
      if (at < 0) return { ok: false, error: `There's no ${label(op.section)} on this page.` };

      const section = getSectionByNodeType(nodes[at].type);
      const spec = section?.fields[op.option];
      if (!spec) {
        return { ok: false, error: `The ${section?.name ?? "section"} has no "${op.option}" setting.` };
      }

      /*
       * Settings only. Aimed at a content field this would OVERWRITE it:
       * set_option(items, "6") on a gallery replaced the array of photographs
       * with the string "6" and lost every image. coerce() returns the raw
       * string for anything that is not a declared option type, so the guard
       * has to be here rather than there.
       */
      if (!isOptionField(spec)) {
        return {
          ok: false,
          error: `"${spec.label}" is content, not a setting — tell me what you want it to say instead.`,
        };
      }

      const value = coerce(op.value, spec.type, spec.choices);
      if (value === undefined) {
        return { ok: false, error: `"${op.value}" isn't a valid ${op.option}.` };
      }

      nodes[at] = { ...nodes[at], props: { ...nodes[at].props, [op.option]: value } };
      return {
        ok: true,
        schema: { ...schema, nodes },
        describe: `Set ${spec.label.toLowerCase()} on the ${section?.name} to ${op.value}.`,
      };
    }

    default:
      return { ok: false, error: "That isn't a change I can make yet." };
  }
}

/** A readable name for a section the client referred to. */
function label(ref: string | undefined): string {
  if (!ref) return "section";
  const section = getSectionByKey(ref) ?? getSectionByNodeType(ref);
  // Falls back to the client's own words — if they called it "What our
  // customers say", that is the clearest thing to call it back to them.
  return section ? section.name : ref.replace(/^["“”']|["“”']$/g, "");
}

/**
 * Turns the model's string value into the type the field expects.
 *
 * The model returns strings because a JSON schema with a union value is
 * unreliable; converting here keeps that ugliness in one place, and returning
 * undefined for nonsense is what lets the caller refuse rather than store
 * `sticky: "maybe"`.
 */
function coerce(
  raw: string,
  type: string,
  choices?: string[],
): string | number | boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (type === "boolean") {
    if (["true", "yes", "on", "1", "enable", "enabled"].includes(v)) return true;
    if (["false", "no", "off", "0", "disable", "disabled"].includes(v)) return false;
    return undefined;
  }
  if (type === "number") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === "choice") {
    return choices?.includes(raw.trim()) ? raw.trim() : undefined;
  }
  return raw;
}
