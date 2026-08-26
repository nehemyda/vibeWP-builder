/* ============================================================
   Export fidelity test.

   For every section in the registry:

     1. Validate the fixture against the section's Zod schema
     2. Render it twice — React (platform) and Gutenberg (export)
     3. Load BOTH from the same shipped stylesheet
     4. Give the Gutenberg render real WordPress conditions:
          · wp-block-library CSS, in @layer plugins
          · inline layout CSS, unlayered, as WordPress prints it
          · layout classes stamped on, as a block-editor re-save does
     5. Screenshot both at two viewports and pixel-diff
     6. Assert: diff < 3%, zero requests off-box, zero console errors

   A section that fails does not ship.
   ============================================================ */

import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registry, sectionNames } from "../packages/renderer/src/registry";
import { renderLikeWordPress } from "../packages/renderer/src/gutenberg/blocks";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEME = process.env.THEME || "pipepro";
const OUT = resolve(root, ".fidelity");
mkdirSync(OUT, { recursive: true });

const MAX_DIFF_PCT = 3;
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "mobile", width: 480, height: 1400 },
];

const sectionsCss = readFileSync(resolve(root, "themes", THEME, "assets/sections.css"), "utf8");
const wpBlockCss = readFileSync(resolve(root, "tools/fixtures/wp-block-library.css"), "utf8")
  .replace(/@charset[^;]*;/g, "");

/* What WordPress prints inline at render time. Unlayered — it cannot be
   pulled into a layer, which is why section selectors are scoped. */
const wpInlineLayout = `
:where(.is-layout-flex){gap:0.5em}
:where(.is-layout-grid){gap:0.5em}
.is-layout-flow > :first-child{margin-block-start:0}
.is-layout-flow > :last-child{margin-block-end:0}
.is-layout-flow > *{margin-block-start:24px;margin-block-end:0}
.is-layout-constrained > *{margin-block-start:24px;margin-block-end:0}
body .is-layout-flow > * + *{margin-block-start:24px;margin-block-end:0}
body .is-layout-constrained > * + *{margin-block-start:24px;margin-block-end:0}
body .is-layout-flex{gap:24px}
body .is-layout-grid{gap:24px}`;

const html = (body: string, head: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${head}
<style>${sectionsCss}</style>
</head><body class="yp-page">${body}</body></html>`;

/** Simulate a re-save in the block editor: WordPress stamps layout classes. */
const stampLayoutClasses = (s: string) =>
  s
    .replace(/class="wp-block-group /g, 'class="wp-block-group is-layout-flow wp-block-group-is-layout-flow ')
    .replace(/class="wp-block-buttons /g, 'class="wp-block-buttons is-layout-flex wp-block-buttons-is-layout-flex ');

/* ------------------------------------------------------------
   Structural assertions.

   A pixel threshold alone is not enough: a broken class name on a
   small element moves well under 1% of the page and would pass.
   These two checks are exact, cheap, and catch the failure modes a
   percentage cannot.
   ------------------------------------------------------------ */

const classesIn = (html: string): Set<string> =>
  new Set((html.match(/yp-[A-Za-z0-9_-]+/g) || []));

/** Every yp-* class must appear in BOTH renders. That parity is the contract. */
function classParity(reactHtml: string, wpHtml: string) {
  const a = classesIn(reactHtml);
  const b = classesIn(wpHtml);
  const onlyReact = [...a].filter((c) => !b.has(c));
  const onlyWp = [...b].filter((c) => !a.has(c));
  return { ok: onlyReact.length === 0 && onlyWp.length === 0, onlyReact, onlyWp };
}

/** Collect every leaf string/number in the fixture. */
function leaves(v: any, out: string[] = []): string[] {
  if (v == null) return out;
  if (typeof v === "string" || typeof v === "number") {
    const s = String(v).trim();
    if (s.length > 1) out.push(s);
    return out;
  }
  if (Array.isArray(v)) { v.forEach((x) => leaves(x, out)); return out; }
  if (typeof v === "object") { Object.values(v).forEach((x) => leaves(x, out)); return out; }
  return out;
}

/** Every value in the fixture must survive into the exported markup.
    Catches a serializer that quietly drops a prop. */
function contentCoverage(fixture: any, wpHtml: string) {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const missing = leaves(fixture).filter(
    (v) => !wpHtml.includes(escape(v)) && !wpHtml.includes(v)
  );
  return { ok: missing.length === 0, missing };
}

async function shoot(page: any, file: string) {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (r: any) => {
    const u = r.url();
    if (!u.startsWith("file://") && !u.startsWith("data:")) external.push(u);
  });
  page.on("pageerror", (e: any) => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
  await page.waitForTimeout(200);
  const shot = file.replace(/\.html$/, ".png");
  await page.screenshot({ path: shot, fullPage: true });
  return { shot, external, errors };
}

async function diff(a: string, b: string, out: string) {
  const [ma, mb] = [await sharp(a).metadata(), await sharp(b).metadata()];
  const W = Math.min(ma.width!, mb.width!);
  const H = Math.min(ma.height!, mb.height!);
  const crop = { left: 0, top: 0, width: W, height: H };
  const bufA = await sharp(a).extract(crop).removeAlpha().raw().toBuffer();
  const bufB = await sharp(b).extract(crop).removeAlpha().raw().toBuffer();

  let differing = 0;
  const raw = Buffer.alloc(W * H * 3);
  for (let i = 0; i < bufA.length; i += 3) {
    const d =
      Math.abs(bufA[i] - bufB[i]) +
      Math.abs(bufA[i + 1] - bufB[i + 1]) +
      Math.abs(bufA[i + 2] - bufB[i + 2]);
    if (d > 24) { differing++; raw[i] = 255; raw[i + 1] = 0; raw[i + 2] = 90; }
    else { raw[i] = raw[i + 1] = raw[i + 2] = 235; }
  }
  await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toFile(out);
  return {
    pct: (differing / (W * H)) * 100,
    heightDelta: Math.abs(ma.height! - mb.height!),
  };
}

/* ---------------------------------------------------------- */

const only = process.argv[2];
const targets = only ? [only] : sectionNames;
const browser = await chromium.launch();
let failed = 0;

console.log("\n  EXPORT FIDELITY\n  " + "─".repeat(62));

for (const name of targets) {
  const entry = registry[name];
  if (!entry) { console.error(`  unknown section: ${name}`); failed++; continue; }

  // 1. the fixture must satisfy the section's own schema
  const parsed = entry.schema.safeParse(entry.fixture);
  if (!parsed.success) {
    console.log(`\n  ${name}\n    schema        FAIL — ${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}`);
    failed++;
    continue;
  }

  // 2. two renders from one set of props
  const reactHtml = renderToStaticMarkup(entry.component(entry.fixture));
  const blockMarkup = entry.toGutenberg(entry.fixture);
  const wpBody = stampLayoutClasses(renderLikeWordPress(blockMarkup));

  writeFileSync(resolve(OUT, `${name}.blocks.html`), blockMarkup);

  console.log(`\n  ${name}`);
  console.log(`    schema        PASS`);

  // 3. structural parity — exact, not visual
  const cls = classParity(reactHtml, wpBody);
  if (cls.ok) {
    console.log(`    class parity  PASS  (${classesIn(reactHtml).size} classes)`);
  } else {
    failed++;
    console.log(`    class parity  FAIL`);
    if (cls.onlyReact.length) console.log(`                  react only: ${cls.onlyReact.join(", ")}`);
    if (cls.onlyWp.length) console.log(`                  export only: ${cls.onlyWp.join(", ")}`);
  }

  const cov = contentCoverage(entry.fixture, wpBody);
  if (cov.ok) {
    console.log(`    prop coverage PASS  (${leaves(entry.fixture).length} values)`);
  } else {
    failed++;
    console.log(`    prop coverage FAIL — dropped by serializer:`);
    cov.missing.slice(0, 4).forEach((m) => console.log(`                  "${m.slice(0, 56)}"`));
  }

  for (const vp of VIEWPORTS) {
    const fReact = resolve(OUT, `${name}-${vp.name}-react.html`);
    const fWp = resolve(OUT, `${name}-${vp.name}-wp.html`);

    writeFileSync(fReact, html(reactHtml, ""));
    writeFileSync(
      fWp,
      html(
        wpBody,
        `<style>@layer plugins;</style>
<style>@layer plugins { ${wpBlockCss} }</style>
<style id="global-styles-inline-css">${wpInlineLayout}</style>`
      )
    );

    const pageA = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
    const a = await shoot(pageA, fReact);
    await pageA.close();

    const pageB = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
    const b = await shoot(pageB, fWp);
    await pageB.close();

    const d = await diff(a.shot, b.shot, resolve(OUT, `${name}-${vp.name}-diff.png`));
    const ext = [...a.external, ...b.external];
    const errs = [...a.errors, ...b.errors];
    const ok = d.pct < MAX_DIFF_PCT && ext.length === 0 && errs.length === 0;
    if (!ok) failed++;

    console.log(
      `    ${vp.name.padEnd(8)}      diff ${d.pct.toFixed(3).padStart(7)}%  ` +
      `Δh ${String(d.heightDelta).padStart(3)}px  ` +
      `ext ${ext.length}  err ${errs.length}   ${ok ? "PASS" : "FAIL"}`
    );
    if (ext.length) console.log(`                  off-box: ${ext.slice(0, 3).join(", ")}`);
    if (errs.length) console.log(`                  error: ${errs[0]}`);
  }
}

await browser.close();

console.log("\n  " + "─".repeat(62));
console.log(failed === 0 ? "  ALL SECTIONS PASS\n" : `  ${failed} FAILURE(S) — artifacts in .fidelity/\n`);
process.exit(failed === 0 ? 0 : 1);
