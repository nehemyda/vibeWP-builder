import { GoogleGenAI } from "@google/genai";
import type { ResolvedSection } from "@/lib/sections/resolve";
import type { EditOp, PageSchema } from "@/lib/sections/edit-ops";
import { modelDeadline } from "./deadline";
import { captureUsage } from "./usage";
import { buildPlanPrompt, OP_KINDS } from "./plan-prompt";

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
    kind: { type: "string", enum: [...OP_KINDS] },
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
  /* Assembled elsewhere so its size and its cacheable prefix can be gated. */
  const { prompt } = buildPlanPrompt({ instruction, schema, available, chrome, form, history });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
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
