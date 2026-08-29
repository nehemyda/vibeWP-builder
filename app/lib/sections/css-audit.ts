import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Static checks on the theme stylesheet that the section gate can run.
 *
 * Exists because the section gate is class-name based: it confirms every class
 * a section emits has a matching rule, which is why it happily passed a footer
 * whose three link columns had collapsed into one. These look for mistakes that
 * are invisible to that check but visible in the CSS text.
 */
const CSS_PATH =
  process.env.VIBEWP_THEME_SRC
    ? join(process.env.VIBEWP_THEME_SRC, "assets", "sections.css")
    : join(process.cwd(), "..", "assets", "ai-builder", "themes", "vibewp", "assets", "sections.css");

export function readThemeCss(): string {
  return readFileSync(CSS_PATH, "utf8");
}

/**
 * Finds grids that put a fixed track in front of an auto-repeat.
 *
 * `grid-template-columns: 1.4fr repeat(auto-fit, minmax(min(100%, 8rem), 1fr))`
 * silently resolves to ONE column: a percentage inside minmax() makes the
 * repetition count indeterminate, so auto-fit gives up and emits a single
 * track. The same min(100%, …) idiom is correct when the auto-repeat is the
 * only track, which is why it works everywhere else in this file.
 *
 * Cost a footer with three stacked link columns before it was spotted by eye.
 */
export function findCollapsingAutoFitGrids(css: string): string[] {
  const problems: string[] = [];
  const lines = css.split("\n");

  lines.forEach((line, i) => {
    const m = line.match(/grid-template-columns:\s*([^;]+);/);
    if (!m) return;
    const value = m[1];
    if (!/repeat\(\s*auto-(fit|fill)/.test(value)) return;

    // Anything before the repeat() that is itself a track definition.
    const before = value.slice(0, value.indexOf("repeat(")).trim();
    if (before.length > 0) {
      problems.push(`line ${i + 1}: "${value.trim()}" — track before an auto-repeat collapses to 1 column`);
    }
  });

  return problems;
}
