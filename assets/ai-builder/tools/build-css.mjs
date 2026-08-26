/* ============================================================
   build-css — concatenate section stylesheets, scope them, write
   the result into the exported theme.

   Authoring form lives next to each component:
       src/styles/base.css
       src/sections/<Name>/styles.css

   Shipped form is one scoped file:
       themes/<theme>/assets/sections.css

   Scoping is what makes section rules outrank WordPress's inline
   layout CSS. See tools/scope-css.mjs for why.
   ============================================================ */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scopeCss } from "./scope-css.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(root, "packages/renderer/src");

const theme = process.argv[2] || "pipepro";
const outFile = resolve(root, "themes", theme, "assets/sections.css");

// Sections to include. In production this comes from the site's page
// schemas so a theme only ships CSS for sections it actually uses.
const sections = process.argv.slice(3);
const included = sections.length ? sections : ["HeroSplit"];

const parts = [readFileSync(resolve(SRC, "styles/base.css"), "utf8")];

for (const name of included) {
  const file = resolve(SRC, `sections/${name}/styles.css`);
  if (!existsSync(file)) {
    console.error(`  missing stylesheet for ${name} — skipped`);
    continue;
  }
  parts.push(readFileSync(file, "utf8"));
}

const scoped = scopeCss(parts.join("\n\n"));
writeFileSync(outFile, scoped);

const n = (scoped.match(/\.yp-page /g) || []).length;
console.log(`build-css: ${included.length} section(s), ${n} scoped selectors`);
console.log(`           → themes/${theme}/assets/sections.css`);
