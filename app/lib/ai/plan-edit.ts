import { plainText } from "@/lib/wp/richtext";
import { GoogleGenAI } from "@google/genai";
import { getSectionByNodeType } from "@/lib/sections";
import type { ResolvedSection } from "@/lib/sections/resolve";
import type { EditOp, PageSchema } from "@/lib/sections/edit-ops";
import { modelDeadline } from "./deadline";
import { captureUsage } from "./usage";

const MODEL = "gemini-2.5-flash";

/**
 * Chooses the operation that satisfies an instruction.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE MODEL PICKS AN ACTION, NOT A PAGE
 *
 * Asked to "create a gallery above the testimonials", a model told to rewrite
 * the page will rewrite the page — and quite often produce the same sections it
 * started with, because nothing in its instructions distinguishes "add one
 * thing" from "write a homepage". Constraining the answer to one operation
 * makes the difference explicit and makes the failure visible: if it cannot
 * find an operation that fits, it must say `unsupported` rather than quietly
 * regenerating.
 *
 * The page is described to it by NODE TYPE plus the section's own heading, so
 * "above the What our customers say" can be resolved to the Testimonials node
 * without the client having to know what we call it.
 */

const OP_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: [
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
      ],
    },
    section: { type: "string" },
    design: { type: "string" },
    slot: { type: "string", enum: ["header", "footer"] },
    action: {
      type: "string",
      enum: ["add_field", "remove_field", "set_width", "set_required", "rename_field"],
    },
    field: { type: "string" },
    label: { type: "string" },
    fieldType: { type: "string" },
    width: { type: "string" },
    required: { type: "string" },
    before: { type: "string" },
    after: { type: "string" },
    position: { type: "string", enum: ["start", "end"] },
    itemCount: { type: "integer" },
    count: { type: "integer" },
    columns: { type: "string" },
    option: { type: "string" },
    value: { type: "string" },
    instruction: { type: "string" },
    reason: { type: "string" },
  },
  /*
   * `before` and `after` are REQUIRED, and empty means "no position given".
   *
   * They were optional, and the model simply left them out — "move the gallery
   * above the What Our Customers Say" came back as
   * {kind:"move_section", section:"ContentGallery"} with no anchor, so the
   * gallery went to the end of the page. A field a model is allowed to omit is
   * a question it is allowed not to answer; making it required forces the
   * position to be considered every time.
   */
  required: ["kind", "section", "before", "after"],
  propertyOrdering: ["kind", "section", "design", "slot", "action", "field", "label", "fieldType", "width", "required", "before", "after", "position", "option", "value", "itemCount", "count", "columns", "instruction", "reason"],
} as const;

export async function planEdit(opts: {
  apiKey: string;
  instruction: string;
  schema: PageSchema;
  available: ResolvedSection[];
  /** Header/footer node types, so options on those can be set too. */
  chrome: { header?: string; footer?: string };
  /**
   * The form this page shows, if any.
   *
   * Without it "make Company name full width" is unanswerable — the model
   * cannot know the form has such a field, or what the others are called, so
   * every form request could only be refused.
   */
  form?: { name: string; fields: { name: string; label: string; type: string; span?: number }[] };
  /**
   * What was said just before this, oldest first.
   *
   * Without it every message was planned as though it were the first thing the
   * client had ever said. "Connect the phone number", one message after asking
   * for a button in the header, was therefore unresolvable — nothing told the
   * model a button existed — so it found a Phone callout SECTION in the
   * catalogue and added that to the page instead. The model was not reasoning
   * badly; it was reasoning without the conversation.
   */
  history?: { role: "user" | "ai"; text: string }[];
}): Promise<EditOp> {
  const { apiKey, instruction, schema, available, chrome, history, form } = opts;
  const ai = new GoogleGenAI({ apiKey });

  /*
   * Each node is listed with its heading. A client refers to a section by what
   * it says — "the What our customers say bit" — never by its node type.
   */
  const page = (schema.nodes ?? [])
    .map((n, i) => {
      const def = getSectionByNodeType(n.type);
      const props = (n.props ?? {}) as Record<string, unknown>;
      const headingText =
        typeof props.heading === "string" ? ` — “${plainText(props.heading)}”` : "";
      const options = def
        ? Object.entries(def.fields)
            .filter(([, f]) => ["boolean", "choice", "number"].includes(f.type))
            .map(([k, f]) => `${k}${f.choices ? ` (${f.choices.join("|")})` : ""}`)
        : [];

      /*
       * How many entries each repeating field holds.
       *
       * Without this the model cannot answer a relative instruction: asked to
       * "add 3 more photos" it correctly said the current count was unknown,
       * because nothing had told it. Given the count it can work out the total
       * itself.
       */
      const counts = def
        ? Object.entries(def.fields)
            .filter(([, f]) => f.type === "list")
            .map(([k]) => {
              const v = props[k];
              return `${Array.isArray(v) ? v.length : 0} ${k}`;
            })
        : [];

      return `${i + 1}. ${n.type}${headingText}` +
        `${counts.length ? `  [currently: ${counts.join(", ")}]` : ""}` +
        `${options.length ? `  [options: ${options.join(", ")}]` : ""}`;
    })
    .join("\n");

  /*
   * The current header and footer, described by what they CONTAIN.
   *
   * Listing only the node type meant the model could not tell whether the
   * header already had a button, so "put the phone number on the button" was
   * indistinguishable from "give me a button" — and it swapped the whole header
   * rather than editing the one already there.
   */
  const describeChrome = (slot: "header" | "footer", nodeType?: string) => {
    if (!nodeType) return "";
    const def = getSectionByNodeType(nodeType);
    if (!def) return `${slot}: ${nodeType}`;
    const has = Object.entries(def.fields)
      .filter(([, f]) => !["boolean", "choice", "number"].includes(f.type))
      .map(([k]) => k);
    const options = Object.entries(def.fields)
      .filter(([, f]) => ["boolean", "choice", "number"].includes(f.type))
      .map(([k, f]) => `${k}${f.choices ? ` (${f.choices.join("|")})` : " (true|false)"}`);
    return `${slot}: ${nodeType} — ${def.description}` +
      `${has.length ? `  [contains: ${has.join(", ")}]` : "  [contains: nothing editable]"}` +
      `${options.length ? `  [options: ${options.join(", ")}]` : ""}`;
  };

  const chromeLines = [
    describeChrome("header", chrome.header),
    describeChrome("footer", chrome.footer),
  ]
    .filter(Boolean)
    .join("\n");

  /* Listed with widths, so "make it full width" has something to compare to. */
  const formLines = form
    ? `## The form on this page — "${form.name}"\n\n` +
      form.fields
        .map(
          (f) =>
            `- ${f.label} (stored as ${f.name}, ${f.type}, ${
              typeof f.span === "number" ? `${f.span}/12 wide` : "half width"
            })`,
        )
        .join("\n") +
      "\n"
    : "";

  const catalogue = available
    .filter((s) => !s.definition.placement || s.definition.placement === "page")
    .map((s) => `- ${s.key} (${s.category}): ${s.description}`)
    .join("\n");

  /*
   * Headers and footers, listed separately.
   *
   * They were excluded from the catalogue entirely, so a request to change the
   * header could only ever be refused — the model was not shown that a header
   * with a button exists. Describing them by what they CONTAIN is what lets
   * "add a button to the header" resolve to the header that has one.
   */
  const chromeCatalogue = available
    .filter((s) => s.definition.placement === "header" || s.definition.placement === "footer")
    .map((s) => `- ${s.key} (${s.definition.placement}): ${s.description}`)
    .join("\n");

  /*
   * The last few turns only. A long transcript buries the instruction being
   * planned and drags in changes long since superseded; the reference that
   * needs resolving is almost always in the previous turn or two.
   */
  const conversation = (history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Client" : "You"}: ${m.text}`)
    .join("\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Choose ONE operation that carries out this instruction on a web page.

${conversation ? `## What was said just before this\n\n${conversation}\n` : ""}
## Instruction

"${instruction}"

## The page as it stands

${page || "(no sections yet)"}

${chromeLines ? `## Site-wide\n\n${chromeLines}\n` : ""}
${formLines}
## Section designs — add one, or swap one of these in for a section already there

${catalogue}

## Headers and footers that can be swapped in

${chromeCatalogue}

## How to answer

- READ THE CONVERSATION ABOVE FIRST. An instruction that names no subject
  refers to whatever was just changed. "Connect the phone number" straight
  after adding a button to the header means put the phone number on THAT
  BUTTON — rewrite_chrome — not add something new to the page. "Make it
  bigger", "change it", "link it up" all resolve the same way: find what "it"
  was in the previous turn.
- Prefer editing the thing just discussed over adding a new thing. Adding is
  what you do when the client asks for something that is not there; a follow-up
  is almost never that.
- "section" is the registry key when adding (e.g. "content-gallery"), and the
  NODE TYPE of an existing section when removing, moving or setting an option
  (e.g. "Testimonials").
- "before" and "after" MUST both appear in your answer. Put the section the new
  or moved one should sit next to in whichever applies, and an empty string ""
  in the other. Use "" for both ONLY when the client gave no position at all.
  "above X" means before: X. "below X" or "under X" means after: X.
  Identify the section by its heading exactly as listed above — "above the What
  our customers say" means before: "What Our Customers Say".
- "section" MUST always appear: the section being added, moved, removed or
  configured. Use "" only for regenerate_page and unsupported.
- Use set_option for layout settings that already exist, such as sticky headers
  or how many photos sit in a row. "value" is always a string: "true", "false",
  "4".
- Use set_items to change HOW MANY entries a repeating section holds — photos
  in a gallery, rows in a list. Put the TOTAL in "count". The current totals are
  shown above as "currently: N items", so "3 more photos" on a gallery of 3 is
  count: 6. Never use set_option for a count.
- Use swap_chrome to change the header or footer itself — adding or removing a
  button, or a different arrangement. Put "header" or "footer" in "slot" and the
  registry key of the one to use in "section". "Add a CTA button to the header"
  means swapping to the header that HAS a button; the current header is listed
  under Site-wide above. Never answer unsupported for a header or footer request
  without first checking the list of headers and footers for one that already
  does what was asked.
- Use rewrite_chrome to change the WORDS or LINK inside the header or footer
  they already have — what the button says, where it points, what the footer
  line reads. Put "header" or "footer" in "slot" and what they asked for in
  "instruction". Prefer this over swap_chrome whenever the current header or
  footer already has the thing being changed: "make the button show the phone
  number" on a header that HAS a button is a rewrite, not a swap. Swapping
  throws away a design the client chose, so only swap when what they want is
  genuinely absent.
- Use swap_section to change how one section on the page LOOKS, keeping its
  words. Put the section they mean in "section" — its name, its type or its own
  heading — and the registry key of the design to use in "design". The
  available designs are listed above with their categories; pick one from the
  SAME category as the section being changed, because that is what a client
  means by a different version of it.
  "Make the hero centred", "this bit looks wrong, try another layout" and "I
  don't like this design" are all swap_section. Their copy is carried over, so
  this is not destructive and does not need a warning.
  Prefer rewrite_section when they want different WORDS, and swap_section when
  they want a different ARRANGEMENT of the same words. If a section already has
  a setting for what they asked — how many columns, sticky or not — use
  set_option instead: changing the whole design to reach a setting throws away
  a layout they may have chosen.
- Use rewrite_section when the client wants different WORDS in one section, and
  put what they asked for in "instruction".
- Use regenerate_page ONLY when they clearly want the whole page written again.
- Use edit_form to change the FORM this page shows — add a question, remove
  one, rename one, make one required, or change how wide it is. Put the action
  in "action", the field the client named in "field" (their words, e.g.
  "Company name"), and the new label, type or width in "label", "fieldType" or
  "width". Widths are "third", "half", "two-thirds", "full", or a number of
  twelfths. The form's current fields are listed above; never claim a form
  cannot be changed from here.
  add_field takes a width too, so "add a Company name field, full width" is ONE
  operation — never refuse it as needing two steps. If a request names a new
  field AND refers vaguely to "this field", assume they mean the one being
  added; that is the only field the sentence introduces.
- Pages are NOT your job and are handled before you see the instruction:
  creating a page, switching to one and rebuilding one all work. Never claim
  they are impossible. The one thing that genuinely cannot be done is DELETING
  a page — say that specifically, and mention that rebuilding a page replaces
  its contents, which is usually what was wanted.
- If nothing fits, answer "unsupported" and put a plain, specific sentence in
  "reason" saying what could not be done. Never pick a nearby operation to
  avoid admitting that — a change the client did not ask for is worse than a
  refusal.

  Write the reason for a business owner who has never heard of this system.
  Say what you could not do to their WEBSITE, not what you could not do
  internally. Words like "operation", "unsupported", "section type", "field"
  and "schema" are ours, not theirs, and must not appear.

  BAD:  "Adding a CTA button to the header is not a supported operation."
  GOOD: "I can't add a button to the header on this design — the header here
        only has room for your business name and the menu."

Return only the JSON object.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: OP_SCHEMA,
      abortSignal: modelDeadline(),
    },
  });
  await captureUsage(response, MODEL);

  const text = response.text;
  if (!text) throw new Error("The planner returned nothing.");

  const parsed = JSON.parse(text) as Record<string, unknown>;
  const kind = String(parsed.kind ?? "unsupported");

  const str = (k: string) => (typeof parsed[k] === "string" && parsed[k] ? (parsed[k] as string) : undefined);

  switch (kind) {
    case "add_section":
      return {
        kind,
        section: str("section") ?? "",
        before: str("before"),
        after: str("after"),
        position: parsed.position === "start" ? "start" : parsed.position === "end" ? "end" : undefined,
        itemCount: typeof parsed.itemCount === "number" ? parsed.itemCount : undefined,
        columns: str("columns"),
      };
    case "remove_section":
      return { kind, section: str("section") ?? "" };
    case "move_section":
      return { kind, section: str("section") ?? "", before: str("before"), after: str("after") };
    case "set_option":
      return {
        kind,
        section: str("section") ?? chrome.header ?? "",
        option: str("option") ?? "",
        value: str("value") ?? "",
      };
    case "set_items":
      return {
        kind,
        section: str("section") ?? "",
        count: typeof parsed.count === "number" ? parsed.count : 0,
      };
    case "edit_form":
      return {
        kind,
        action: (parsed.action as "add_field") ?? "add_field",
        field: str("field"),
        label: str("label"),
        fieldType: str("fieldType"),
        width: str("width"),
        required: str("required"),
      };
    case "rewrite_chrome":
      return {
        kind,
        slot: parsed.slot === "footer" ? "footer" : "header",
        instruction: str("instruction") ?? instruction,
      };
    case "swap_chrome":
      return {
        kind,
        slot: parsed.slot === "footer" ? "footer" : "header",
        section: str("section") ?? "",
      };
    case "swap_section":
      return { kind, section: str("section") ?? "", design: str("design") ?? "" };
    case "rewrite_section":
      return { kind, section: str("section") ?? "", instruction: str("instruction") ?? instruction };
    case "regenerate_page":
      return { kind };
    default:
      return { kind: "unsupported", reason: str("reason") ?? "I couldn't work out what to change." };
  }
}
