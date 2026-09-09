import { CtaBoxed } from "@/lib/sections/cta-boxed";
import { readThemeCss } from "@/lib/sections/css-audit";
import { writeFileSync } from "node:fs";

const sample = CtaBoxed.sample as Record<string, unknown>;
const html = CtaBoxed.toGutenberg({ ...sample, background: "tint", layout: "full" } as never);
const css = readThemeCss();
const body = html.replace(/<!--[\s\S]*?-->/g, "");
writeFileSync("/tmp/ctabox-check.html", `<!doctype html><html><head><style>${css}</style></head><body class="yp-page">${body}</body></html>`);
console.log("wrote");
