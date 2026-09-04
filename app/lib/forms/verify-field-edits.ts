import { applyFieldEdit } from "./apply-field-edit";
import type { FormFieldSpec } from "@/app/actions/forms";

/**
 * Pure tests for editing a form by sentence.
 * Run: npx tsx lib/forms/verify-field-edits.ts
 */
const base: FormFieldSpec[] = [
  { name: "name", label: "Your name", type: "text", required: true, span: 6 },
  { name: "email", label: "Email", type: "email", required: true, span: 6 },
  { name: "message", label: "How can we help?", type: "textarea", required: true, span: 12 },
];

let failures = 0;
function check(what: string, got: boolean, detail = "") {
  if (!got) failures += 1;
  console.log(`  ${got ? "ok  " : "FAIL"} ${what}${detail ? ` — ${detail}` : ""}`);
}

// The reported case.
const added = applyFieldEdit(base, { action: "add_field", label: "Company name", width: "full" });
check("adds Company name at full width", added.ok && added.fields.at(-1)?.span === 12,
  added.ok ? added.describe : added.error);

// Referred to by label, which is what a client says.
const widened = applyFieldEdit(base, { action: "set_width", field: "Your name", width: "full" });
check("widens by label", widened.ok && widened.fields[0].span === 12);

// And by a partial label, which is how people talk.
const partial = applyFieldEdit(base, { action: "set_width", field: "help", width: "half" });
check("matches a partial label", partial.ok && partial.fields[2].span === 6);

// And by the stored key.
const byKey = applyFieldEdit(base, { action: "set_required", field: "email", required: "no" });
check("optional by stored name", byKey.ok && byKey.fields[1].required === false);

// Renaming keeps the key, or answers already filed are orphaned.
const renamed = applyFieldEdit(base, { action: "rename_field", field: "Your name", label: "Full name" });
check("rename keeps the storage key", renamed.ok && renamed.fields[0].name === "name" && renamed.fields[0].label === "Full name");

// Duplicates refused rather than silently shadowing.
const dupe = applyFieldEdit(base, { action: "add_field", label: "Email" });
check("refuses a duplicate field", !dupe.ok, dupe.ok ? "" : dupe.error);

// A form with no questions cannot be submitted.
const one = applyFieldEdit([base[0]], { action: "remove_field", field: "Your name" });
check("refuses to empty the form", !one.ok, one.ok ? "" : one.error);

// Unknown field refuses instead of guessing.
const missing = applyFieldEdit(base, { action: "set_width", field: "VAT number", width: "full" });
check("refuses an unknown field", !missing.ok, missing.ok ? "" : missing.error);

// Nonsense width refuses rather than storing something meaningless.
const bad = applyFieldEdit(base, { action: "set_width", field: "Email", width: "enormous" });
check("refuses a width it cannot read", !bad.ok);

// Removing a field must not disturb the others' keys.
const removed = applyFieldEdit(base, { action: "remove_field", field: "Email" });
check("removal leaves other keys intact",
  removed.ok && removed.fields.map((f) => f.name).join(",") === "name,message");

console.log(failures === 0 ? "\nALL FORM EDIT TESTS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
