import { plainText } from "@/lib/wp/richtext";
import { getSectionByNodeType } from "@/lib/sections";
import type { ResolvedSection } from "@/lib/sections/resolve";
import type { PageSchema } from "@/lib/sections/edit-ops";
import { SECTION_STYLE_FIELDS } from "@/lib/design/section-style";
import { ELEMENT_STYLE_FIELDS } from "@/lib/design/element-style";
import { PART_VISIBILITY_OPTIONS } from "@/lib/design/part-visibility";
import { PART_SIZE_OPTIONS } from "@/lib/design/part-size";

/**
 * The planner's prompt, assembled. Pure, so its size and shape can be gated.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE FIXED PART COMES FIRST
 *
 * Every edit a client makes sends this prompt, and most of it never changes:
 * the operations, the rules, the catalogue of designs. Gemini caches a prompt
 * PREFIX it has seen before and bills those tokens at a fraction — but only
 * the prefix, byte for byte. With the page and the instruction at the top the
 * prefix was different every time and nothing was ever cached. So the fixed
 * text is first and the page, the conversation and the instruction are last.
 *
 * WHY THE CATALOGUE IS KEYS, NOT DESCRIPTIONS
 *
 * Fifty-three designs with a sentence each was a third of every edit's cost,
 * paid to answer "change the button text". The keys already say what they are
 * — form-photo, hero-centered, faq-two-column — and they are grouped under the
 * category the planner is told to pick from. Headers and footers keep their
 * descriptions: there are ten, and "the header that has a button" is resolved
 * from what they contain.
 *
 * WHY THE STYLE SETTINGS ARE NAMED ONCE
 *
 * Every section carries the same forty-odd style settings — heading size,
 * button shape, hide-on-mobile for each part. Listed per section, a six-
 * section page spent 7,000 characters saying the same thing six times; it
 * was most of the cost of every edit. They are described once, in the fixed
 * part, and each section lists only the settings that are its own.
 *
 * WHY CHAT TURNS ARE CUT SHORT
 *
 * The conversation is here to resolve "it". A turn's first line does that; the
 * six-bullet list under "Created your homepage" does not, and was being sent
 * with every message for the rest of the session.
 * ─────────────────────────────────────────────────────────────────────
 */

export const OP_KINDS = [
  "add_section",
  "remove_section",
  "move_section",
  "set_option",
  "set_items",
  "swap_chrome",
  "rewrite_chrome",
  "edit_form",
  "swap_section",
  "rewrite_section",
  "regenerate_page",
  "unsupported",
] as const;

/** Enough of a chat turn to know what "it" was. */
export const TURN_CHARS = 160;

export type PlanPromptInput = {
  instruction: string;
  schema: PageSchema;
  available: ResolvedSection[];
  chrome: { header?: string; footer?: string };
  form?: { name: string; fields: { name: string; label: string; type: string; span?: number }[] };
  history?: { role: "user" | "ai"; text: string }[];
};

const OPTION_TYPES = ["boolean", "choice", "number"];

/** Settings every section has, so they are described once and never per section. */
/* The same four sets lib/sections/index.ts merges into every page section. */
const SHARED_FIELDS = { ...SECTION_STYLE_FIELDS, ...ELEMENT_STYLE_FIELDS, ...PART_VISIBILITY_OPTIONS, ...PART_SIZE_OPTIONS };
export const SHARED_FIELD_KEYS: ReadonlySet<string> = new Set(Object.keys(SHARED_FIELDS));
const SHARED_OPTIONS = SHARED_FIELD_KEYS;

/**
 * The shared settings as one block. The hide/width families are patterns —
 * "hidePhoneMobile", "widthHeading" — and are given as patterns rather than
 * as the thirty names they expand to.
 */
function sharedOptionsText(): string {
  const plain: string[] = [];
  const hideParts = new Set<string>();
  const widthParts = new Set<string>();
  for (const [name, spec] of Object.entries(SHARED_FIELDS)) {
    const hide = /^hide([A-Z][a-z]+)(Desktop|Tablet|Mobile)$/.exec(name);
    const width = /^width([A-Z][a-z]+)$/.exec(name);
    if (hide) hideParts.add(hide[1]);
    else if (width) widthParts.add(width[1]);
    else plain.push(`${name}${spec.choices ? ` (${spec.choices.join("|")})` : spec.type === "boolean" ? " (true|false)" : ""}`);
  }
  const widthChoices = Object.entries(SHARED_FIELDS).find(([k, f]) => /^width[A-Z]/.test(k) && f.choices)?.[1].choices;
  const lines = [plain.join(", ")];
  if (hideParts.size) lines.push(`hide<Part><Device> (true|false) — Part: ${[...hideParts].join("|")}; Device: Desktop|Tablet|Mobile. e.g. hidePhoneMobile`);
  if (widthParts.size) lines.push(`width<Part> (${widthChoices?.join("|") ?? "auto|25|33|50|66|75|100"}) — Part: ${[...widthParts].join("|")}`);
  return lines.join("\n");
}

const RULES = `Choose ONE operation that carries out a client's instruction on a web page. Answer with a JSON object.

## Operations

- add_section: put a new section on the page. "section" = a design key from the catalogue below. "before" / "after" = the heading of the section it should sit next to, exactly as listed on the page: "above X" is before: X; "below X" or "under X" is after: X.
- remove_section, move_section: "section" = the node type or heading of a section already on the page. move_section takes before / after the same way.
- set_option: a setting a section already has — sticky, columns, background. "value" is always a string: "true", "false", "4". Never for how many entries something holds.
- set_items: how many entries a repeating section holds — photos in a gallery, rows in a list. "count" = the TOTAL. The page lists current counts, so "3 more photos" on a gallery of 3 is count: 6.
- swap_chrome: a different header or footer design. "slot" = header or footer; "section" = a key from the headers-and-footers list. Only when what they want is genuinely absent from the current one: "add a CTA button to the header" means the header that HAS a button. Never answer unsupported for a header or footer request without checking that list first.
- rewrite_chrome: the WORDS or LINK in the header or footer they already have — what the button says, where it points, what the footer line reads. Preferred over swap_chrome whenever the current one already has the thing being changed; swapping throws away a design the client chose.
- swap_section: how one section LOOKS, keeping its words. "section" = the one they mean, by name, type or heading; "design" = a key from the SAME category as that section. "Make the hero centred", "try another layout", "I don't like this design" are all swap_section — not destructive, no warning needed. If a setting already covers the request, use set_option instead.
- rewrite_section: different WORDS in one section; "instruction" = what they asked for. Only the words they name are changed and the rest is kept, so this is right for a single label, heading or sentence as much as for a whole section.
- regenerate_page: ONLY when they clearly want the whole page written again.
- edit_form: the form this page shows. "action" = add_field, remove_field, rename_field, set_required or set_width; "field" = the field in their words (e.g. "Company name"); "label", "fieldType" or "width" as needed. Widths: "third", "half", "two-thirds", "full", or a number of twelfths. add_field takes a width too, so "add a Company name field, full width" is ONE operation. A request that names a new field and says "this field" means the one being added.
- unsupported: when nothing fits. "reason" = one plain sentence, for a business owner, about what could not be done to their WEBSITE. Never use our words — operation, unsupported, section type, field, schema. Never pick a nearby operation to avoid admitting it: a change they did not ask for is worse than a refusal.
  BAD:  "Adding a CTA button to the header is not a supported operation."
  GOOD: "I can't add a button to the header on this design — the header here only has room for your business name and the menu."

## Rules for every answer

- Read the conversation first. An instruction that names no subject refers to whatever was just changed: "connect the phone number" straight after adding a button to the header means put the number on THAT button — rewrite_chrome — not add something new. "Make it bigger", "change it", "link it up" resolve the same way. Prefer editing the thing just discussed over adding a new thing.
- "section", "before" and "after" MUST all appear. Use "" in before and after when no position was given, and "" in section only for regenerate_page and unsupported.
- Pages are not your job and already work — creating a page, switching to one, rebuilding one. Never say they are impossible. The one thing that cannot be done is DELETING a page: say that specifically, and mention that rebuilding a page replaces its contents.`;

function catalogueOf(available: ResolvedSection[]): string {
  const byCategory = new Map<string, string[]>();
  for (const s of available) {
    if (s.definition.placement && s.definition.placement !== "page") continue;
    const list = byCategory.get(s.category) ?? [];
    list.push(s.key);
    byCategory.set(s.category, list);
  }
  return [...byCategory.entries()].map(([category, keys]) => `${category}: ${keys.join(", ")}`).join("\n");
}

function chromeCatalogueOf(available: ResolvedSection[]): string {
  return available
    .filter((s) => s.definition.placement === "header" || s.definition.placement === "footer")
    .map((s) => `- ${s.key} (${s.definition.placement}): ${s.description}`)
    .join("\n");
}

/** Each node with its heading, counts and settings — what a client can point at. */
function describePage(schema: PageSchema): string {
  return (schema.nodes ?? [])
    .map((n, i) => {
      const def = getSectionByNodeType(n.type);
      const props = (n.props ?? {}) as Record<string, unknown>;
      const heading = typeof props.heading === "string" ? ` — “${plainText(props.heading)}”` : "";
      /* Its OWN settings only; the shared ones are described once, above. */
      const options = def
        ? Object.entries(def.fields)
            .filter(([k, f]) => OPTION_TYPES.includes(f.type) && !SHARED_OPTIONS.has(k))
            .map(([k, f]) => `${k}${f.choices ? ` (${f.choices.join("|")})` : ""}`)
        : [];
      const counts = def
        ? Object.entries(def.fields)
            .filter(([, f]) => f.type === "list")
            .map(([k]) => `${Array.isArray(props[k]) ? (props[k] as unknown[]).length : 0} ${k}`)
        : [];
      return (
        `${i + 1}. ${n.type}${heading}` +
        `${counts.length ? `  [currently: ${counts.join(", ")}]` : ""}` +
        `${options.length ? `  [options: ${options.join(", ")}]` : ""}`
      );
    })
    .join("\n");
}

/** The current header or footer, by what it CONTAINS, so "the button" resolves. */
function describeChrome(slot: "header" | "footer", nodeType?: string): string {
  if (!nodeType) return "";
  const def = getSectionByNodeType(nodeType);
  if (!def) return `${slot}: ${nodeType}`;
  const has = Object.entries(def.fields)
    .filter(([k, f]) => !OPTION_TYPES.includes(f.type) && !SHARED_OPTIONS.has(k))
    .map(([k]) => k);
  const options = Object.entries(def.fields)
    .filter(([k, f]) => OPTION_TYPES.includes(f.type) && !SHARED_OPTIONS.has(k))
    .map(([k, f]) => `${k}${f.choices ? ` (${f.choices.join("|")})` : " (true|false)"}`);
  return (
    `${slot}: ${nodeType} — ${def.description}` +
    `${has.length ? `  [contains: ${has.join(", ")}]` : "  [contains: nothing editable]"}` +
    `${options.length ? `  [options: ${options.join(", ")}]` : ""}`
  );
}

const cut = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > TURN_CHARS ? line.slice(0, TURN_CHARS - 1).trimEnd() + "…" : line;
};

export function buildPlanPrompt(input: PlanPromptInput): { prompt: string; staticLength: number } {
  const { instruction, schema, available, chrome, form, history } = input;

  const fixed = [
    RULES,
    `## Style settings every section has — for set_option (a section's own settings are listed with it below)\n\n${sharedOptionsText()}`,
    `## Section designs, by category — for add_section and swap_section\n\n${catalogueOf(available)}`,
    `## Headers and footers — for swap_chrome\n\n${chromeCatalogueOf(available)}`,
  ].join("\n\n");

  const chromeLines = [describeChrome("header", chrome.header), describeChrome("footer", chrome.footer)]
    .filter(Boolean)
    .join("\n");

  const formLines = form
    ? `## The form on this page — "${form.name}"\n\n` +
      form.fields
        .map(
          (f) =>
            `- ${f.label} (stored as ${f.name}, ${f.type}, ${typeof f.span === "number" ? `${f.span}/12 wide` : "half width"})`,
        )
        .join("\n")
    : "";

  const conversation = (history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Client" : "You"}: ${cut(m.text)}`)
    .join("\n");

  const dynamic = [
    `## The page as it stands\n\n${describePage(schema) || "(no sections yet)"}`,
    chromeLines ? `## Site-wide\n\n${chromeLines}` : "",
    formLines,
    conversation ? `## What was said just before this\n\n${conversation}` : "",
    `## Instruction\n\n"${instruction}"\n\nReturn only the JSON object.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { prompt: `${fixed}\n\n${dynamic}`, staticLength: fixed.length };
}
