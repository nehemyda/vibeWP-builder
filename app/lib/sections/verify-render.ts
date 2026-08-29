import { SECTIONS } from "./index";
import { sectionToTemplatePart } from "@/lib/wp/serialize";

/**
 * Catches placeholder values reaching rendered markup.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Every AI-written button on every site rendered as
 * `class="yp-btn--undefined"` — a class no rule in sections.css matches, so
 * the button appeared as bare text. It survived because `variant` is not a
 * declared field on any section, so the model never produced one, while every
 * section's `sample` hard-codes `variant: "primary"`. The section library
 * previews samples, so the one place anyone looked was the one place it worked.
 *
 * The lesson generalises past buttons: a sample is not evidence, because a
 * sample is written by hand and generated props are not. So this renders each
 * section with the sample STRIPPED of anything the AI has no field to fill,
 * which is the shape real content actually arrives in.
 *
 * Run: npx tsx lib/sections/verify-render.ts
 */

/** Values that mean "a variable reached the page" rather than real content. */
const LEAKS = /undefined|\[object Object\]|NaN|\bnull\b/;

/** Field names present in samples that no section declares as a field. */
function undeclaredKeys(sample: Record<string, unknown>, fields: Record<string, unknown>): string[] {
  return Object.keys(sample).filter((k) => !(k in fields));
}

function stripUndeclared(props: Record<string, unknown>, def: (typeof SECTIONS)[number]): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(props)) as Record<string, unknown>;

  for (const [name, value] of Object.entries(out)) {
    const spec = def.fields[name] as { of?: Record<string, unknown> } | undefined;
    if (!Array.isArray(value)) continue;
    // Entries in a list may only carry the keys the list declares.
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      for (const key of Object.keys(entry as Record<string, unknown>)) {
        if (!spec?.of || !(key in spec.of)) delete (entry as Record<string, unknown>)[key];
      }
    }
  }
  return out;
}

let failures = 0;

for (const section of SECTIONS) {
  const sample = (section.sample ?? {}) as Record<string, unknown>;

  const stray = undeclaredKeys(sample, section.fields as Record<string, unknown>);
  if (stray.length > 0) {
    // Not fatal on its own — but it is exactly how the button bug hid, so it
    // is worth seeing.
    console.log(`  note ${section.key}: sample sets ${stray.join(", ")}, which no field declares`);
  }

  const html = sectionToTemplatePart(section.nodeType, stripUndeclared(sample, section));
  const leak = html.match(new RegExp(`[\\w-]*(${LEAKS.source})[\\w-]*`));
  if (leak) {
    failures += 1;
    console.log(`  FAIL ${section.key}: rendered "${leak[0]}" with AI-shaped props`);
  }
}

console.log(
  failures === 0
    ? `ALL ${SECTIONS.length} SECTIONS RENDER CLEAN WITH AI-SHAPED PROPS`
    : `${failures} section(s) leak placeholder values`,
);
process.exit(failures === 0 ? 0 : 1);
