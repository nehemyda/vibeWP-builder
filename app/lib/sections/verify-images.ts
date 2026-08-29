/**
 * Checks every sample image against the Pexels API.
 *
 *   npx tsx lib/sections/verify-images.ts
 *
 * Separate from verify.ts because it needs the network and PEXELS_API_KEY,
 * so it cannot be a build gate.
 *
 * It exists because guessed photo IDs shipped. images.pexels.com returns 200
 * for any well-formed ID, so a wrong guess renders a real photograph of the
 * wrong thing — and seven sections did: an aeroplane window captioned as cut
 * flowers, a bedroom captioned as a florist at a workbench. The alt text was
 * therefore false, which is worse for a screen reader than no alt at all.
 *
 * HTTP 200 alone proves nothing. Compare the two alt lines it prints: ours
 * must describe the same thing Pexels does.
 */
import { readFileSync } from "node:fs";
import { parse } from "node-html-parser";
import { SECTIONS } from "@/lib/sections";

const key = readFileSync(".env.local", "utf8").match(/^PEXELS_API_KEY=(.*)$/m)![1].trim();

type Row = { section: string; id: string; url: string; ours: string };
const rows: Row[] = [];
for (const s of SECTIONS) {
  for (const img of parse(s.toGutenberg(s.sample)).querySelectorAll("img")) {
    const url = img.getAttribute("src") ?? "";
    rows.push({
      section: s.key,
      id: url.match(/photos\/(\d+)/)?.[1] ?? "",
      url,
      ours: img.getAttribute("alt") ?? "",
    });
  }
}

async function main() {
console.log(`${rows.length} sample images across ${new Set(rows.map((r) => r.section)).size} sections\n`);

for (const r of rows) {
  const head = await fetch(r.url, { method: "HEAD" });
  let theirs = "—";
  if (r.id) {
    const res = await fetch(`https://api.pexels.com/v1/photos/${r.id}`, {
      headers: { Authorization: key },
    });
    theirs = res.ok ? ((await res.json()).alt ?? "(none)") : `API ${res.status}`;
  }
  const bad = head.status !== 200 ? "  <<< DEAD" : "";
  console.log(`${r.section.padEnd(20)} ${r.id.padEnd(9)} HTTP ${head.status} ${head.headers.get("content-type")}${bad}`);
  console.log(`   ours:   ${r.ours}`);
  console.log(`   pexels: ${theirs}`);
}

}
void main();
