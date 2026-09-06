import { imagePaths } from "@/lib/design/image-map";
import { parse, type HTMLElement } from "node-html-parser";
import { SECTIONS } from "@/lib/sections";
import { sectionPreviewMarkup, markElement, addClasses } from "@/lib/wp/serialize";
import { allStyleClasses } from "@/lib/design/section-style";
import { ELEMENT_ROLES, allElementClasses } from "@/lib/design/element-style";
import { readThemeCss, findCollapsingAutoFitGrids } from "@/lib/sections/css-audit";

/**
 * The whole-registry check. Run with `npx tsx lib/sections/verify.ts [keyPrefix]`.
 *
 * Every assertion here exists because the corresponding bug shipped and the
 * user found it, not because it seemed prudent:
 *
 *   - unstyled classes      → 12 sections had buttons with colour but no shape,
 *                             because the rule was scoped to one hero's actions
 *   - collapsing grids      → the footer fell to one column
 *   - round-trip stability  → a pull from WordPress silently dropped fields
 *   - cross-matching        → one section's parser claiming another's markup
 *   - alt text              → non-negotiable for SEO and screen readers
 *
 * Checks that were wrong on their first run are noted where they are made — a
 * gate with known false positives gets ignored, which is worse than no gate.
 */

const css = readThemeCss();
let fails = 0;
const fail = (m: string) => { console.log("  FAIL " + m); fails++; };

// 0. the bug class from the footer regression
const collapsing = findCollapsingAutoFitGrids(css);
console.log("== collapsing auto-fit grids ==");
if (collapsing.length) collapsing.forEach((c) => fail(c));
else console.log("  ok — none");

/* Default to every section: a change to one section's CSS can break another's
 * class coverage, and the footer grid bug proved a whole-registry sweep is the
 * only sweep worth trusting. Pass a key prefix to narrow it while iterating. */
const prefix = process.argv[2] ?? "";
const targets = SECTIONS.filter((s) => s.key.startsWith(prefix));
console.log(`\n== ${targets.length} sections${prefix ? ` matching "${prefix}"` : ""} ==`);

for (const s of targets) {
  const html = s.toGutenberg(s.sample);
  const root = parse(html);

  // 1. root class present
  if (!root.querySelector(`.${s.rootClass}`)) fail(`${s.key}: root .${s.rootClass} missing`);

  /*
   * A header or footer built entirely from wp:site-title and wp:navigation has
   * nothing to parse — those blocks carry no inner HTML — so demanding a parser
   * there would be a permanent, unfixable failure.
   */
  const isTemplatePart = (s.placement ?? "page") !== "page";

  // 2. round-trip: parse back, re-serialize, compare
  if (!s.fromGutenberg) {
    if (isTemplatePart) console.log(`  ${s.key.padEnd(20)} (template part, no parseable content)`);
    else fail(`${s.key}: no parser`);
  } else {
    const back = s.fromGutenberg(root);
    if (!back) fail(`${s.key}: parser returned null on its own output`);
    else {
      const again = s.toGutenberg(back);
      if (again !== html) {
        fail(`${s.key}: round-trip not stable`);
        const a = html.split("\n"), b = again.split("\n");
        for (let i = 0; i < Math.max(a.length, b.length); i++)
          if (a[i] !== b[i]) { console.log(`    line ${i}\n    - ${a[i]}\n    + ${b[i]}`); break; }
      }
    }
  }

  // 3. every class the markup emits is styled
  const emitted = new Set<string>();
  for (const m of html.matchAll(/class="([^"]+)"/g))
    m[1].split(/\s+/).filter((c) => c.startsWith("yp-")).forEach((c) => emitted.add(c));
  const unstyled = [...emitted].filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css));
  if (unstyled.length) fail(`${s.key}: unstyled classes ${unstyled.join(", ")}`);

  // 4. no alt-less images
  for (const img of root.querySelectorAll("img"))
    if (!(img.getAttribute("alt") ?? "").trim()) fail(`${s.key}: image with empty alt`);

  /*
   * 5. Every anchor is reached by some rule — the bug where 12 sections had
   * buttons with colour but no padding, radius or underline removal.
   *
   * The first version of this check only looked at the anchor's own class and
   * so flagged eleven correct anchors: a phone link inside .yp-cntc__value is
   * styled by `.yp-cntc__value a`, and WordPress will not let a block author
   * put a class on the <a> anyway. So an ancestor-scoped rule counts.
   */
  for (const a of root.querySelectorAll("a")) {
    const own = a.getAttribute("class") ?? "";
    if (own.includes("wp-block-button__link") || own.includes("yp-")) continue;

    const ancestors: string[] = [];
    for (let n: HTMLElement | null = a.parentNode; n; n = n.parentNode) {
      (n.getAttribute?.("class") ?? "")
        .split(/\s+/)
        .filter((c) => c.startsWith("yp-"))
        .forEach((c) => ancestors.push(c));
    }
    const reached = ancestors.some((c) => new RegExp(`\\.${c}(?![\\w-])[^,{]*\\sa\\b`).test(css));
    if (!reached) fail(`${s.key}: unstyled anchor "${a.textContent.trim()}"`);
  }

  // 6. no cross-matching — this section's parser must not claim another's markup
  for (const other of SECTIONS) {
    if (other.key === s.key || !other.fromGutenberg) continue;
    if (other.fromGutenberg(root)) fail(`${s.key}: markup also parsed by ${other.key}`);
  }

  /*
   * 7. The library card renders something, rather than the blank cards headers
   * showed before withPreviewPlaceholders() existed. The floor is lower for a
   * template part: a minimal header legitimately renders one placeholder brand
   * name and nothing else.
   */
  const previewText = parse(sectionPreviewMarkup(s.nodeType, s.sample)).textContent.trim();
  const floor = isTemplatePart ? 10 : 40;
  if (previewText.length < floor) fail(`${s.key}: preview nearly empty (${previewText.length} chars)`);

  /*
   * 8. The canvas can identify it.
   *
   * schemaToGutenberg stamps data-vibewp-node on each section's outermost
   * element so a click in the preview can be traced back to a schema node. A
   * section that failed to be stamped would be one the client cannot select —
   * invisible, and only in the builder — so it is asserted rather than assumed.
   */
  const marked = markElement(html, "data-vibewp-node", "7");
  const rootTag = parse(marked).querySelector(`.${s.rootClass}`);
  if (marked === html) fail(`${s.key}: cannot be stamped for selection`);
  else if (rootTag?.getAttribute("data-vibewp-node") !== "7") {
    fail(`${s.key}: selection stamp landed outside .${s.rootClass}`);
  }

  /*
   * 9. A style class keeps the block valid.
   *
   * core/group rebuilds the element's class from the `className` in the block
   * comment, so the two must agree exactly or WordPress regenerates different
   * markup from what is stored and marks the section as containing unexpected
   * content — the failure a class was chosen to avoid. Asserted rather than
   * trusted, because it is invisible until someone opens wp-admin.
   */
  if (!isTemplatePart) {
    const styled = addClasses(html, "u-space--lg");
    const inComment = styled.match(/"className":"([^"]*)"/)?.[1];
    const inElement = styled.match(/<[a-z]+[^>]*\sclass="([^"]*)"/)?.[1];
    if (!inComment?.includes("u-space--lg")) {
      fail(`${s.key}: a style class never reached the block comment`);
    } else if (!inElement?.endsWith(inComment)) {
      fail(`${s.key}: block comment and element class disagree — WordPress would reject it`);
    }
  }

  console.log(`  ${s.key.padEnd(20)} ${html.length} bytes, ${emitted.size} classes, preview ${previewText.length} chars`);
}

// 10. registry hygiene across ALL sections
const keys = new Set<string>(), nodes = new Set<string>(), roots = new Set<string>();
for (const s of SECTIONS) {
  if (keys.has(s.key)) fail(`duplicate key ${s.key}`); keys.add(s.key);
  if (nodes.has(s.nodeType)) fail(`duplicate nodeType ${s.nodeType}`); nodes.add(s.nodeType);
  if (roots.has(s.rootClass)) fail(`duplicate rootClass ${s.rootClass}`); roots.add(s.rootClass);
}
/*
 * Every style utility resolves to a real rule. A control that emits a class
 * the stylesheet does not define is a control that silently does nothing.
 */
console.log("\n== section style utilities ==");
for (const cls of allStyleClasses()) {
  if (!new RegExp(`\\.${cls.replace(/[-]/g, "\\-")}(?![\\w-])`).test(css)) {
    fail(`style utility .${cls} is emitted but never styled`);
  }
}
for (const cls of allElementClasses()) {
  if (!new RegExp(`\\.${cls.replace(/[-]/g, "\\-")}(?![\\w-])`).test(css)) {
    fail(`element utility .${cls} is emitted but never styled`);
  }
}
console.log(`  ${allStyleClasses().length + allElementClasses().length} utilities, all styled`);

/*
 * Every role exclusion still names a class that exists.
 *
 * `.yp-logos__heading` is excluded because it is a 0.74rem uppercase caption
 * wearing the heading suffix — offering it the display-heading control would
 * turn a caption into a headline. If that class is ever renamed, the exclusion
 * silently stops protecting anything, and the only symptom is a caption that
 * suddenly obeys a control it should not.
 */
console.log("\n== element role exclusions ==");
for (const role of ELEMENT_ROLES) {
  for (const cls of role.except) {
    if (!new RegExp(`\\.${cls.replace(/[-]/g, "\\-")}(?![\\w-])`).test(css)) {
      fail(`${role.key} excludes .${cls}, which no longer exists in the stylesheet`);
    }
  }
  // And the role has to match something, or it is a control that reaches nothing.
  const matches = css.match(new RegExp(role.match.source, "g")) ?? [];
  const real = matches.filter((m) => !role.except.includes(m));
  if (real.length === 0) fail(`element role "${role.key}" matches no class in the stylesheet`);
  else console.log(`  ${role.key.padEnd(10)} ${new Set(real).size} classes, ${role.except.length} excluded`);
}

/*
 * Every photograph a section holds must be REACHABLE BY PATH.
 *
 * The export copies images into the client's media library by walking these
 * paths, and it used to walk only props.image — so a gallery's three photos,
 * and six more across three other families, were never copied and stayed
 * pointing at Pexels on live sites. A section that starts keeping an image
 * somewhere new must not be able to reintroduce that silently.
 */
console.log("\n== photographs reachable by path ==");
{
  let found = 0;
  let sectionsWithImages = 0;
  for (const section of SECTIONS) {
    const paths = imagePaths(section.sample as Record<string, unknown>);
    if (!paths.length) continue;
    sectionsWithImages += 1;
    found += paths.length;
    for (const { path, image } of paths) {
      if (!image.url) fail(`${section.key}: image at ${path} has no url`);
    }
  }
  // A floor rather than an exact count, so adding a section is not a failure.
  if (found < 19) fail(`only ${found} photographs reachable; 19 were before`);
  else console.log(`  ${found} photographs across ${sectionsWithImages} sections`);
}

console.log(`\n== registry: ${SECTIONS.length} sections, keys/nodeTypes/rootClasses all unique ==`);
console.log(fails === 0 ? "\nALL GATES PASS" : `\n${fails} FAILURE(S)`);

/* A gate that always exits 0 gates nothing: chained from `npm run verify`,
   a failure here has to stop the run. */
process.exitCode = fails === 0 ? 0 : 1;
