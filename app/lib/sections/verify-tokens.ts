import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readThemeCss } from "./css-audit";

/**
 * Proves that adding a token changed nothing.
 *
 *   npx tsx lib/sections/verify-tokens.ts
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS BEFORE THE REFACTOR, NOT AFTER
 *
 * Making the stylesheet adjustable means rewriting a lot of declarations that
 * currently work. The whole safety argument is one sentence: an unset token
 * resolves to the literal that was there before, so nothing moves until
 * somebody moves it.
 *
 * That sentence is either true or it is a hope. This makes it a test. Every
 * declaration in the stylesheet is REDUCED — each `var(--x, fallback)`
 * replaced by its fallback, each `calc(<expr> * 1)` collapsed back to
 * `<expr>` — and the result must match a committed snapshot of the file as it
 * was, declaration for declaration, in source order.
 *
 * Pure text. No browser, no layout engine, so it runs with the other gates in
 * about a second and covers all 198 font-size declarations at once.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It compares DECLARATIONS, not computed styles, so it cannot see specificity,
 * inheritance or media queries. It proves the refactor was faithful; it does
 * not prove the cascade is unchanged. Source order is therefore compared
 * strictly — `.yp-hdr__brand` at 1.15rem and `.yp-ftr__brand` at 1.3rem are
 * two rules where the second wins by position alone, so a reordering that a
 * looser comparison would forgive is exactly the kind that breaks the design.
 * ─────────────────────────────────────────────────────────────────────
 */

const FIXTURE = join(process.cwd(), "lib", "sections", "__fixtures__", "sections.pre-tokens.css");

/** Tokens whose default is a multiplier, so `* 1` is the identity to collapse. */
const SCALE_DEFAULT = "1";

let fails = 0;
const fail = (m: string) => {
  fails += 1;
  if (fails <= 20) console.log("  FAIL " + m);
};

/* ── reduction ─────────────────────────────────────────────────────── */

/**
 * Replaces `var(--name, fallback)` with its fallback, innermost first.
 *
 * Parenthesis-balanced on purpose. A fallback is very often a `clamp()` with
 * its own commas — `var(--x, clamp(1.9rem, 3vw, 2.6rem))` — and splitting on
 * the first comma is precisely how a refactor of 47 clamps goes wrong without
 * anyone noticing.
 */
export function reduceVars(css: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    if (!css.startsWith("var(", i)) {
      out += css[i];
      i += 1;
      continue;
    }
    const open = i + 3;
    const close = matchParen(css, open);
    if (close < 0) {
      out += css.slice(i);
      break;
    }
    const inner = css.slice(open + 1, close);
    const comma = topLevelComma(inner);
    if (comma < 0) {
      /*
       * No fallback, so there is nothing to reduce TO — and the read is
       * legitimate whenever the token is defined in this same file, which is
       * true of ~200 reads of the theme's own tokens. Left verbatim so it
       * compares equal on both sides; whether it actually resolves is a
       * separate question, asked once at the end.
       */
      out += css.slice(i, close + 1);
    } else {
      // Recursion, because a fallback may itself be a var() with a fallback.
      out += reduceVars(inner.slice(comma + 1).trim());
    }
    i = close + 1;
  }
  return out;
}

function matchParen(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "(") depth += 1;
    else if (css[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function topLevelComma(inner: string): number {
  let depth = 0;
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === "(") depth += 1;
    else if (inner[i] === ")") depth -= 1;
    else if (inner[i] === "," && depth === 0) return i;
  }
  return -1;
}

/**
 * Collapses `calc(<expr> * 1)` back to `<expr>`.
 *
 * A shared token has to be a multiplier rather than a replacement — eleven
 * heroes carry eleven deliberately different display scales, and one absolute
 * value would make them identical. So the refactored form is
 * `calc(clamp(…) * var(--yp-display-scale, 1))`, which reduces to
 * `calc(clamp(…) * 1)`, which is the same computed value as `clamp(…)` but not
 * the same text. This is the step that lets the comparison stay textual.
 */
export function collapseIdentityCalc(value: string): string {
  let out = value;
  for (let pass = 0; pass < 6; pass += 1) {
    const next = out.replace(
      new RegExp(`calc\\(\\s*([^()]*(?:\\([^()]*\\)[^()]*)*?)\\s*\\*\\s*${SCALE_DEFAULT}\\s*\\)`, "g"),
      (_, expr: string) => expr.trim(),
    );
    if (next === out) return out;
    out = next;
  }
  return out;
}

/* ── declaration tuples ────────────────────────────────────────────── */

type Decl = { index: number; context: string; selector: string; prop: string; value: string };

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Every declaration in the file, in source order, with the at-rule it sits in.
 *
 * The at-rule matters: 20 media blocks carry 27 of the grid-template-columns
 * declarations, and a rule that moved between breakpoints would otherwise
 * compare equal.
 */
export function declarations(css: string): Decl[] {
  const clean = stripComments(css);
  const out: Decl[] = [];
  const stack: string[] = [];
  let i = 0;
  let buffer = "";
  let index = 0;

  while (i < clean.length) {
    const ch = clean[i];
    if (ch === "{") {
      const head = squash(buffer);
      buffer = "";
      if (head.startsWith("@")) {
        stack.push(head);
        i += 1;
        continue;
      }
      // A rule: read to its closing brace.
      const close = clean.indexOf("}", i);
      const body = clean.slice(i + 1, close === -1 ? clean.length : close);
      for (const raw of body.split(";")) {
        const colon = raw.indexOf(":");
        if (colon < 0) continue;
        const prop = squash(raw.slice(0, colon));
        if (!prop || prop.startsWith("--") === false && !/^[a-z-]+$/.test(prop)) {
          // Keep custom properties and normal properties; skip anything odd.
          if (!prop.startsWith("--")) continue;
        }
        out.push({
          index: index++,
          context: stack.join(" >> "),
          selector: head,
          prop,
          value: collapseIdentityCalc(squash(raw.slice(colon + 1))),
        });
      }
      i = close === -1 ? clean.length : close + 1;
      continue;
    }
    if (ch === "}") {
      stack.pop();
      buffer = "";
      i += 1;
      continue;
    }
    /*
     * A semicolon while gathering a selector ends an at-STATEMENT rather than
     * a rule — `@layer plugins;` at the top of this file, and `@charset` or
     * `@import` elsewhere. Without clearing it, the buffer became
     * "@layer plugins; :root", which starts with "@", so `:root` was filed as
     * an at-rule and its entire body — all 17 design tokens — was never read.
     * The gate reported EQUIVALENT while --radius changed from 10px to 11px.
     */
    if (ch === ";") {
      buffer = "";
      i += 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  return out;
}

/* ── the gate ──────────────────────────────────────────────────────── */

/*
 * BOTH sides are reduced. The fixture already contains var() reads with
 * fallbacks of its own — the whole --vwf-* family, which embed.js sets at
 * runtime — so reducing only the current file compared two different things
 * and reported 17 differences that were not differences.
 *
 * Reduction is idempotent on those, and turns a newly added
 * `calc(X * var(--yp-scale, 1))` into `X`, which is what makes the comparison
 * meaningful.
 */
const before = declarations(reduceVars(readFileSync(FIXTURE, "utf8")));
const afterRaw = readThemeCss();
const after = declarations(reduceVars(afterRaw));

console.log(`== token equivalence ==`);
console.log(`  fixture ${before.length} declarations, current ${after.length} after reduction`);

if (before.length !== after.length) {
  fail(`declaration count changed: ${before.length} → ${after.length}`);
}

const limit = Math.min(before.length, after.length);
for (let n = 0; n < limit; n += 1) {
  const a = before[n];
  const b = after[n];
  if (a.selector !== b.selector) {
    fail(`#${n} selector moved\n        was: ${a.selector}\n        now: ${b.selector}`);
    break;
  }
  if (a.context !== b.context) {
    fail(`#${n} at-rule changed on ${a.selector}: "${a.context}" → "${b.context}"`);
    continue;
  }
  if (a.prop !== b.prop) {
    fail(`#${n} property changed on ${a.selector}: ${a.prop} → ${b.prop}`);
    continue;
  }
  if (a.value !== b.value) {
    fail(`${a.selector} { ${a.prop} }\n        was: ${a.value}\n        now: ${b.value}`);
  }
}

/*
 * Every var() read has to resolve to something.
 *
 * This is the check that catches --faint, which is read twice with no fallback
 * and defined nowhere the stylesheet can see, so both declarations are invalid
 * at computed-value time and two elements of small print render at full body
 * ink instead of grey. It would also have caught the four --wp--custom--space--*
 * reads and the --wp--custom--layout--content-size typo, all of which are dead
 * channels that have been dead since they were written.
 */
console.log("\n== every var() read resolves ==");
const declaredHere = new Set(
  [...stripComments(afterRaw).matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]),
);
/*
 * Supplied by WordPress rather than by us. Named individually rather than
 * wildcarded, so adding a read of a property nothing emits is a failure and
 * not a shrug — which is how the dead --wp--custom--* channel survived.
 */
const FROM_WORDPRESS = new Set([
  // Emitted on :root from theme.json settings.color.palette. Verified live.
  ...["primary", "primary-fg", "ink", "ink-2", "muted", "surface", "surface-2", "line"].map(
    (slug) => `--wp--preset--color--${slug}`,
  ),
  // Emitted on :root from settings.layout.contentSize.
  "--wp--style--global--content-size",
  // WordPress core's own, neutralised rather than read.
  "--wp--style--unstable-gallery-gap",
]);
/** Set at runtime by embed.js on the form element, never in CSS. */
const RUNTIME_INJECTED = /^--vwf-/;

const unresolved = new Map<string, number>();
for (const m of stripComments(afterRaw).matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/gi)) {
  const name = m[1];
  const hasFallback = m[2] === ",";
  if (hasFallback) continue;
  if (declaredHere.has(name) || FROM_WORDPRESS.has(name) || RUNTIME_INJECTED.test(name)) continue;
  unresolved.set(name, (unresolved.get(name) ?? 0) + 1);
}
if (unresolved.size === 0) console.log("  ok — none read without a fallback or a definition");
for (const [name, count] of unresolved) {
  fail(`${name} is read ${count}× with no fallback and is defined nowhere`);
}

console.log(fails === 0 ? "\nTOKENS EQUIVALENT" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
