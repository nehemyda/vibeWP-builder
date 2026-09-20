/**
 * The planner's prompt — its size and its cacheable shape — asserted.
 *
 * Run with `npx tsx lib/ai/verify-plan-prompt.ts`, and as part of
 * `npm run verify`. No network, no key: the prompt is a pure function.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * Every edit a client makes pays for this prompt, and it grew without anyone
 * noticing: a 6,500-token plan call to change one button's label, most of it
 * forty style settings repeated for every section on the page. Nothing broke.
 * The ledger is what showed it, and this is what stops it growing back — a
 * ceiling on a representative page, and the two properties that make the
 * fixed part cacheable: it is first, and it is identical whatever the page.
 * ─────────────────────────────────────────────────────────────────────
 */
import { SECTIONS } from "@/lib/sections";
import { SECTION_STYLE_FIELDS } from "@/lib/design/section-style";
import { ELEMENT_STYLE_FIELDS } from "@/lib/design/element-style";
import { PART_VISIBILITY_OPTIONS } from "@/lib/design/part-visibility";
import { PART_SIZE_OPTIONS } from "@/lib/design/part-size";
import type { ResolvedSection } from "@/lib/sections/resolve";
import { buildPlanPrompt, OP_KINDS, TURN_CHARS } from "./plan-prompt";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

/* Every design, as the resolver would hand them over for the top plan. */
const available: ResolvedSection[] = SECTIONS.map((definition, i) => ({
  key: definition.key,
  nodeType: definition.nodeType,
  name: definition.name,
  description: definition.description,
  category: definition.category,
  isActive: true,
  sortOrder: i,
  aiPrompt: definition.aiPrompt,
  definition,
})) as ResolvedSection[];

const page = {
  schemaVersion: "1.0",
  nodes: [
    { id: "1", type: "HeroSplit", props: { heading: "Handmade Sourdough in Bath", actions: [{ label: "a" }, { label: "b" }], features: ["x", "y", "z", "w"] } },
    { id: "2", type: "ServicesEditorial", props: { heading: "Our Specialities", items: [{}, {}] } },
    { id: "3", type: "Testimonials", props: { heading: "What Our Customers Say", items: [{}, {}] } },
    { id: "4", type: "Faq", props: { heading: "Common Questions", items: [{}, {}, {}, {}] } },
    { id: "5", type: "CtaBand", props: { heading: "Order Your Custom Cake", actions: [{ label: "a" }] } },
    { id: "6", type: "ContactBlock", props: { heading: "Visit Us in Bath", actions: [{ label: "a" }] } },
  ],
};
const chrome = { header: "HeaderCta", footer: "FooterColumns" };
const form = {
  name: "Contact form",
  fields: [
    { name: "name", label: "Your name", type: "text", span: 6 },
    { name: "email", label: "Email", type: "email", span: 6 },
    { name: "message", label: "Message", type: "textarea", span: 12 },
  ],
};
const history = [
  { role: "user" as const, text: "regenerate the home page" },
  { role: "ai" as const, text: "Created your homepage — 6 sections. " + "• A section line that goes on and on. ".repeat(30) },
  { role: "user" as const, text: "Change the first button in the hero to say See Today's Loaves" },
  { role: "ai" as const, text: "Changed the Buttons in the Split hero. The page now has 6 sections." },
];

const a = buildPlanPrompt({ instruction: "Change the second button in the hero to say Order a Wedding Cake", schema: page, available, chrome, form, history });

/* ── 1. The ceiling ──────────────────────────────────────────────────── */
{
  /* 9,000 chars is roughly 2,500 tokens — under half of what the same page
     cost before, with room for a section or two more. */
  const CEILING = 9_000;
  if (a.prompt.length > CEILING) fail(`prompt is ${a.prompt.length} chars for a 6-section page with a form and chat; ceiling ${CEILING}`);
  else console.log(`  ok   a 6-section page with a form and chat plans in ${a.prompt.length} chars (ceiling ${CEILING})`);
}

/* ── 2. Shared style settings appear once, not per section ──────────── */
{
  const shared = Object.keys({ ...SECTION_STYLE_FIELDS, ...ELEMENT_STYLE_FIELDS, ...PART_VISIBILITY_OPTIONS, ...PART_SIZE_OPTIONS });
  const dynamic = a.prompt.slice(a.staticLength);
  const leaked = shared.filter((k) => new RegExp(`\\b${k}\\b`).test(dynamic));
  if (leaked.length) fail(`shared settings listed per section: ${leaked.slice(0, 5).join(", ")}…`);
  else console.log(`  ok   ${shared.length} shared style settings are described once, never per section`);
  for (const probe of ["headings (", "buttonShape (", "hide<Part><Device>", "width<Part>"]) {
    if (!a.prompt.slice(0, a.staticLength).includes(probe)) fail(`the fixed part does not describe ${probe}`);
  }
  /* A section's OWN settings must still be there, or set_option loses them. */
  if (!/HeaderCta.*sticky \(true\|false\)/.test(dynamic)) fail("the header's own 'sticky' setting was dropped with the shared ones");
  if (!/1\. HeroSplit.*background \(none\|tint\)/.test(dynamic)) fail("the hero's own 'background' setting was dropped with the shared ones");
  console.log("  ok   a section's own settings (sticky, background) are still listed with it");
}

/* ── 3. The fixed part is first and identical for a different page ──── */
{
  const b = buildPlanPrompt({
    instruction: "add a gallery above the testimonials",
    schema: { schemaVersion: "1.0", nodes: [{ id: "9", type: "HeroCentered", props: { heading: "Something else" } }] },
    available,
    chrome: { header: "HeaderSimple" },
    history: [],
  });
  const prefixA = a.prompt.slice(0, a.staticLength);
  const prefixB = b.prompt.slice(0, b.staticLength);
  if (prefixA !== prefixB) fail("the fixed prefix differs between two pages — nothing can be cached");
  else if (prefixA.length < 4_000) fail(`fixed prefix is ${prefixA.length} chars; Gemini caches prefixes from ~1,024 tokens (~4,000 chars)`);
  else console.log(`  ok   the first ${prefixA.length} chars are identical for any page — a cacheable prefix`);
  const iPage = a.prompt.indexOf("## The page as it stands");
  const iInstr = a.prompt.indexOf("## Instruction");
  const iConv = a.prompt.indexOf("## What was said just before this");
  if (!(a.staticLength <= iPage && iPage < iConv && iConv < iInstr)) fail("order must be fixed part → page → conversation → instruction");
  else console.log("  ok   page, conversation and instruction come last, in that order");
}

/* ── 4. Every operation the schema allows is explained ──────────────── */
{
  const ops = a.prompt.slice(a.prompt.indexOf("## Operations"), a.prompt.indexOf("## Rules for every answer"));
  const missing = OP_KINDS.filter((k) => !new RegExp(`\\b${k}\\b`).test(ops));
  if (missing.length) fail(`operations with no explanation: ${missing.join(", ")}`);
  else console.log(`  ok   all ${OP_KINDS.length} operations are explained in the prompt`);
}

/* ── 5. Every design stays reachable, by key ────────────────────────── */
{
  const missing = available.filter((s) => !a.prompt.includes(s.key)).map((s) => s.key);
  if (missing.length) fail(`designs missing from the catalogue: ${missing.join(", ")}`);
  else console.log(`  ok   all ${available.length} designs are in the catalogue by key, grouped by category`);
  const chromeWithDesc = available.filter((s) => s.definition.placement === "header" || s.definition.placement === "footer");
  const bare = chromeWithDesc.filter((s) => !a.prompt.includes(`${s.key} (${s.definition.placement}): ${s.description}`));
  if (bare.length) fail(`headers/footers without their description: ${bare.map((s) => s.key).join(", ")}`);
  else console.log(`  ok   ${chromeWithDesc.length} headers and footers keep their descriptions`);
}

/* ── 6. A long chat turn is cut to its first line ───────────────────── */
{
  const conv = a.prompt.slice(a.prompt.indexOf("## What was said just before this"), a.prompt.indexOf("## Instruction"));
  const longest = Math.max(...conv.split("\n").map((l) => l.length));
  if (longest > TURN_CHARS + 12) fail(`a chat turn of ${longest} chars reached the prompt whole`);
  else console.log(`  ok   the 1,000-char homepage summary reached the planner as ${longest} chars`);
  if (!conv.includes("See Today's Loaves")) fail("the previous instruction — what 'it' refers to — was cut");
}

console.log(fails === 0 ? "\nTHE PLANNER PROMPT IS SMALL AND CACHEABLE" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
