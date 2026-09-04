import type { FormFieldSpec } from "@/app/actions/forms";
import { defaultSpan } from "./static-markup";

/**
 * Changing one field on a form, as a pure function.
 *
 * Kept out of the action so it can be tested without a model, a database or a
 * network — the same reason applyOp for sections is pure.
 */

export type FieldEdit = {
  action: "add_field" | "remove_field" | "set_width" | "set_required" | "rename_field";
  field?: string;
  label?: string;
  fieldType?: string;
  width?: string;
  required?: string;
};

export type FieldEditResult =
  | { ok: true; fields: FormFieldSpec[]; describe: string }
  | { ok: false; error: string };

const TYPES = ["text", "email", "tel", "textarea", "select", "checkbox", "number", "date", "url"];

/** Words people use for widths, and what they mean in twelfths. */
const WIDTH_WORDS: Record<string, number> = {
  third: 4,
  "a third": 4,
  half: 6,
  "a half": 6,
  "two-thirds": 8,
  "two thirds": 8,
  full: 12,
  "full width": 12,
  whole: 12,
};

function spanFrom(width: string | undefined): number | null {
  const w = (width ?? "").trim().toLowerCase();
  if (!w) return null;
  if (w in WIDTH_WORDS) return WIDTH_WORDS[w];
  const n = Number(w.replace(/[^\d]/g, ""));
  // A bare number is twelfths; anything outside the grid is not a width.
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

/**
 * Finds a field by whatever the client called it.
 *
 * They say "Company name" — the label — and almost never "company_name", which
 * is what it is stored as. Both work, and so does a partial label, because
 * "the company field" is how people refer to it out loud.
 */
function indexOfField(fields: FormFieldSpec[], ref: string | undefined): number {
  const wanted = (ref ?? "").trim().toLowerCase();
  if (!wanted) return -1;
  const exact = fields.findIndex(
    (f) => f.label.toLowerCase() === wanted || f.name.toLowerCase() === wanted,
  );
  if (exact >= 0) return exact;
  return fields.findIndex(
    (f) => f.label.toLowerCase().includes(wanted) || wanted.includes(f.label.toLowerCase()),
  );
}

/** A storage key that is stable and unique, so answers cannot overwrite each other. */
function keyFor(label: string, taken: string[]): string {
  const base =
    label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field";
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function applyFieldEdit(fields: FormFieldSpec[], edit: FieldEdit): FieldEditResult {
  const next = fields.map((f) => ({ ...f }));

  if (edit.action === "add_field") {
    const label = (edit.label ?? edit.field ?? "").trim();
    if (!label) return { ok: false, error: "Tell me what the new question should ask." };
    if (indexOfField(next, label) >= 0) {
      return { ok: false, error: `There's already a "${label}" field on this form.` };
    }
    const type = TYPES.includes(edit.fieldType ?? "") ? (edit.fieldType as FormFieldSpec["type"]) : "text";
    const span = spanFrom(edit.width) ?? defaultSpan(type);
    next.push({ name: keyFor(label, next.map((f) => f.name)), label, type, span });
    return { ok: true, fields: next, describe: `Added "${label}" to the form.` };
  }

  const at = indexOfField(next, edit.field);
  if (at < 0) {
    return { ok: false, error: `There's no "${edit.field ?? "that"}" field on this form.` };
  }
  const target = next[at];

  switch (edit.action) {
    case "remove_field": {
      /*
       * Removing a field does NOT remove answers already given to it: those
       * live on each submission and stay readable. It only stops it being
       * asked in future.
       */
      next.splice(at, 1);
      if (next.length === 0) {
        return { ok: false, error: "A form needs at least one question." };
      }
      return { ok: true, fields: next, describe: `Removed "${target.label}" from the form.` };
    }
    case "set_width": {
      const span = spanFrom(edit.width);
      if (span === null) {
        return { ok: false, error: `"${edit.width ?? ""}" isn't a width I understand.` };
      }
      next[at] = { ...target, span, width: undefined };
      const named = Object.entries(WIDTH_WORDS).find(([, v]) => v === span)?.[0] ?? `${span}/12`;
      return { ok: true, fields: next, describe: `"${target.label}" is now ${named}.` };
    }
    case "set_required": {
      const yes = /^(true|yes|on|required|1)$/i.test((edit.required ?? "").trim());
      next[at] = { ...target, required: yes };
      return {
        ok: true,
        fields: next,
        describe: `"${target.label}" is now ${yes ? "required" : "optional"}.`,
      };
    }
    case "rename_field": {
      const label = (edit.label ?? "").trim();
      if (!label) return { ok: false, error: "Tell me what it should say instead." };
      /*
       * The LABEL changes; the stored name does not. Renaming the key would
       * orphan every answer already filed under the old one.
       */
      next[at] = { ...target, label };
      return { ok: true, fields: next, describe: `"${target.label}" now reads "${label}".` };
    }
    default:
      return { ok: false, error: "That isn't a change I can make to a form." };
  }
}
