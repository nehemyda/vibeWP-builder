/**
 * Lifting a plan off an existing page, asserted.
 *
 * Run with `npx tsx lib/sections/verify-clone-plan.ts`, and as part of
 * `npm run verify`. Reads no database.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE
 *
 * planFromSchema is the whole of "start from an existing site". Both ways it
 * can be wrong are silent.
 *
 * It can brief the generator against the wrong section. The first version
 * matched jobs to sections BY POSITION, which lines up only while a page still
 * follows the canonical plan for its slug — and a page anyone has edited does
 * not. On a real edited homepage that put "Common questions" on a testimonials
 * section and "The ask" on an FAQ: every job one slot out, each a small lie to
 * the generator about what it was writing, and nothing anywhere reporting it.
 *
 * It can also leak a section past plan-gating. The lift reads a page built on
 * one plan and must produce a plan for ANOTHER site, so a section the source
 * could use and the target cannot must not survive. If it does, a cheaper plan
 * silently gets a section it did not buy.
 * ─────────────────────────────────────────────────────────────────────
 */
import { SECTIONS } from "./index";
import { planFromSchema } from "./page-plan";
import type { ResolvedSection } from "./resolve";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

/** Every page section, as though every one were allowed. */
const ALL: ResolvedSection[] = SECTIONS.filter((s) => s.placement !== "header" && s.placement !== "footer").map(
  (s) => ({
    key: s.key,
    nodeType: s.nodeType,
    name: s.name,
    description: s.description,
    category: s.category,
    isActive: true,
    sortOrder: 0,
    aiPrompt: s.aiPrompt ?? "",
    allowedPlans: [],
    definition: s,
  }) as unknown as ResolvedSection,
);

const node = (key: string) => {
  const def = SECTIONS.find((s) => s.key === key);
  if (!def) throw new Error(`no such section: ${key}`);
  return { id: `n_${key}`, type: def.nodeType, props: {} };
};

const schemaOf = (...keys: string[]) => ({ schemaVersion: "1.0", nodes: keys.map(node) });

/*
 * 1. THE REGRESSION. A homepage whose order differs from the canonical plan —
 *    which is what any edited page is. Each job must belong to ITS section,
 *    not to whatever sat in that position.
 */
const edited = schemaOf("testimonials", "faq", "cta-band", "hero-split");
const lifted = planFromSchema(edited, ALL, "home");

const jobBySection = new Map(lifted.map((p) => [p.section.key, p.job]));
for (const [key, mustNotBe] of [
  ["testimonials", "Common questions"],
  ["faq", "The ask"],
] as const) {
  const job = jobBySection.get(key);
  if (job === mustNotBe) {
    fail(`${key} was briefed as "${job}" — that is the next slot's job, so matching is positional again`);
  }
}
if (lifted.length !== 4) fail(`expected 4 sections lifted, got ${lifted.length}`);
console.log("  ok   jobs follow their section, not their position");
for (const p of lifted) console.log(`         ${p.section.key.padEnd(20)} ${p.job}`);

/* 2. Order is preserved — a clone that reshuffles the page is not the layout
 *    anyone chose. */
const order = lifted.map((p) => p.section.key).join(",");
if (order !== "testimonials,faq,cta-band,hero-split") {
  fail(`order changed: ${order}`);
} else {
  console.log("  ok   order preserved exactly");
}

/* 3. PLAN GATING. A section the target may not use must not survive the lift. */
const narrowed = ALL.filter((s) => s.key !== "faq");
const gated = planFromSchema(edited, narrowed, "home");
if (gated.some((p) => p.section.key === "faq")) {
  fail("faq survived a lift into a plan that does not allow it");
} else if (gated.length !== 3) {
  fail(`expected 3 after gating, got ${gated.length}`);
} else {
  console.log("  ok   a section the target's plan disallows is dropped");
}

/* 4. Rubbish in gives an empty plan, not a crash — the caller falls back to
 *    planPage, so this must fail soft. */
for (const [label, input] of [
  ["null", null],
  ["no nodes", {}],
  ["nodes not an array", { nodes: "x" }],
  ["unknown node types", { nodes: [{ type: "NoSuchSection" }] }],
] as const) {
  const out = planFromSchema(input, ALL, "home");
  if (out.length !== 0) fail(`${label}: expected an empty plan, got ${out.length}`);
}
console.log("  ok   malformed or unknown input yields an empty plan, not a throw");

/* 5. Every lifted section carries a non-empty job, or the prompt has a hole. */
for (const p of planFromSchema(schemaOf("embed-block", "content-gallery"), ALL, "about")) {
  if (!p.job.trim()) fail(`${p.section.key} lifted with an empty job`);
}
console.log("  ok   sections outside the slug's slots still get a job");

console.log(fails === 0 ? "\nCLONE PLAN LIFTS CLEANLY" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
