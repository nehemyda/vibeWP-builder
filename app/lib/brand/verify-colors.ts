/**
 * Checks the logo colour extraction.
 *
 *   npx tsx lib/brand/verify-colors.ts
 *
 * Offline and deterministic: the "logos" are synthesised ImageData, so this
 * needs no browser, no canvas and no fixture files. Every case is one that
 * would produce a visibly wrong site if it regressed — most of all the pale
 * logo, where taking the colour faithfully yields a button nobody can read.
 */
import { extractPalette, ensureContrast, contrastRatio } from "./logo-colors";

function logo(bg: [number, number, number, number], mark: [number, number, number, number], markPixels: number) {
  const total = 400;
  const data = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i++) data.set(i < markPixels ? mark : bg, i * 4);
  return { data, width: 20, height: 20, colorSpace: "srgb" } as unknown as ImageData;
}

let fails = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "  ok  " : "  FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fails++;
};

const orange = extractPalette(logo([255, 255, 255, 255], [245, 73, 0, 255], 80));
check("brand colour found, not the white background", orange?.candidates[0].hex === "#f54900", orange?.candidates[0].hex);

const mono = extractPalette(logo([255, 255, 255, 255], [17, 17, 17, 255], 80));
check("black-on-white returns null rather than inventing one", mono === null);

const transparent = extractPalette(logo([0, 0, 0, 0], [29, 78, 216, 255], 60));
check("transparent padding ignored", transparent?.candidates[0].hex === "#1d4ed8", transparent?.candidates[0].hex);

const pale = extractPalette(logo([255, 255, 255, 255], [255, 214, 0, 255], 90));
check("pale logo colour is deepened", pale?.adjustedForContrast === true);
check(
  "  ...and the applied colour is legible",
  !!pale && contrastRatio(pale.primary, "#fafafa") >= 3.4,
  pale ? `${pale.candidates[0].hex} -> ${pale.primary} (${contrastRatio(pale.primary, "#fafafa").toFixed(2)}:1)` : "",
);

const deep = extractPalette(logo([255, 255, 255, 255], [17, 107, 78, 255], 90));
check("an already-legible colour is left alone", deep?.adjustedForContrast === false && deep?.primary === "#116b4e");

check("ensureContrast terminates on black", typeof ensureContrast("#000000") === "string");

console.log(fails === 0 ? "\nALL COLOUR TESTS PASS" : `\n${fails} FAILURE(S)`);
