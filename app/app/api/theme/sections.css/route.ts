import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Serves the exported theme's own sections.css to the builder preview.
 *
 * Read from the theme directory rather than copied into public/, because a copy
 * is a second source of truth and would drift — which is the exact problem this
 * endpoint exists to end. The builder canvas and the WordPress front end now
 * load the same bytes.
 *
 * Same path convention as lib/wp/local-driver.ts, which installs this theme.
 */
const THEME_CSS = process.env.VIBEWP_THEME_SRC
  ? join(process.env.VIBEWP_THEME_SRC, "assets", "sections.css")
  : join(process.cwd(), "..", "assets", "ai-builder", "themes", "vibewp", "assets", "sections.css");

export async function GET() {
  try {
    const css = await readFile(THEME_CSS, "utf8");
    return new Response(css, {
      headers: {
        "content-type": "text/css; charset=utf-8",
        // no-store so editing the theme shows up in the preview on reload,
        // without a build step in between.
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[theme] could not read sections.css", err);
    // Fail as valid CSS: an unstyled preview is recoverable, a hard error in
    // the canvas is not.
    return new Response("/* theme stylesheet unavailable */", {
      status: 404,
      headers: { "content-type": "text/css; charset=utf-8" },
    });
  }
}
