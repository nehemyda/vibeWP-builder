/* ============================================================
   scope-css — build step

   Prefixes every section selector with the page-level class so it
   carries two classes of specificity.

   WHY: WordPress prints unlayered layout CSS at render time, e.g.

       body .is-layout-flow > * + * { margin-block-start: 24px }   (0,1,1)
       body .is-layout-flex         { gap: 24px }                  (0,1,1)

   Those classes appear on blocks the moment a page is re-saved in the
   block editor. A single-class rule like `.yp-hero__copy` is (0,1,0)
   and loses. Prefixed, it is (0,2,0) and wins — without any !important
   and without fighting the cascade by hand.

   Run over every section stylesheet during both platform build and export.
   ============================================================ */

const SKIP = /^(:root|html|body|@|\*|from$|to$|\d+%$)/;

export function scopeCss(css, scope = ".yp-page") {
  const lines = css.split("\n");
  let inKeyframes = 0;
  let depth = 0;

  return lines
    .map((line) => {
      const t = line.trim();

      if (/^@keyframes/.test(t)) inKeyframes = depth + 1;
      const opens = (t.match(/{/g) || []).length;
      const closes = (t.match(/}/g) || []).length;

      // A selector line is any line with an opening brace whose head is not
      // an at-rule or a comment. Handles both `sel {` and `sel { decls }`.
      const head0 = t.includes("{") ? t.slice(0, t.indexOf("{")).trim() : "";
      const isSelector =
        t.includes("{") &&
        head0.length > 0 &&
        !head0.startsWith("@") &&
        !head0.startsWith("/*") &&
        !head0.startsWith("*") &&
        !inKeyframes;

      let out = line;

      if (isSelector) {
        const idx = line.indexOf("{");
        const head = line.slice(0, idx);
        const tail = line.slice(idx); // "{" plus any same-line declarations
        const indent = head.match(/^\s*/)[0];
        const selectors = head.trim().split(",").map((s) => s.trim()).filter(Boolean);

        const scoped = selectors.map((s) => {
          if (SKIP.test(s)) return s;
          if (s.startsWith(scope)) return s;
          // body.yp-page style rules stay as authored
          if (/^body/.test(s)) return s;
          return `${scope} ${s}`;
        });

        out = `${indent}${scoped.join(", ")} ${tail}`;
      }

      depth += opens - closes;
      if (inKeyframes && depth < inKeyframes) inKeyframes = 0;

      return out;
    })
    .join("\n");
}

/* CLI: node scope-css.mjs in.css out.css */
if (process.argv[1] && process.argv[1].endsWith("scope-css.mjs")) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const [, , inFile, outFile] = process.argv;
  if (inFile && outFile) {
    const src = readFileSync(inFile, "utf8");
    writeFileSync(outFile, scopeCss(src));
    const n = (scopeCss(src).match(/\.yp-page /g) || []).length;
    console.log(`scoped ${n} selectors → ${outFile}`);
  }
}
