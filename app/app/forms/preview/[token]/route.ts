/**
 * A form, rendered exactly as a visitor will see it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A ROUTE HANDLER AND NOT A PAGE
 *
 * As a page this produced TWO <html> and TWO <body> elements: every page under
 * app/ is wrapped by the root layout, so returning a document from one nests it
 * inside the document that already exists. The browser gets invalid markup and
 * React fails to hydrate.
 *
 * A route handler owns its whole response, so this is a genuinely standalone
 * page — which is also what makes it a fair preview. The root layout's fonts
 * and resets would otherwise lend the form styling no client's site will have.
 *
 * WHY IT LOADS embed.js RATHER THAN RENDERING SERVER-SIDE
 *
 * A second renderer would drift from the first. That is precisely how the
 * builder canvas drifted from WordPress, and every gallery, sticky-header and
 * mobile-nav bug in this project came out of that gap. What appears here is not
 * a likeness of the embedded form; it IS the embedded form.
 */

/** The token lands in an HTML attribute, so it may only be what a token is. */
const TOKEN = /^[A-Za-z0-9_-]{1,80}$/;

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  if (!TOKEN.test(token)) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Form preview</title>
<!-- Never indexed: this is a client's form on our domain, not a page of ours. -->
<meta name="robots" content="noindex, nofollow">
<style>
  body {
    margin: 0;
    padding: 32px;
    background: #fff;
    color: #12151c;
    /* A neutral system stack, deliberately. The embed inherits whatever the
       host page uses, so anything distinctive here would be a claim about the
       client's site that we cannot make. */
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .wrap { max-width: 640px; margin: 0 auto; }
</style>
</head>
<body>
  <div class="wrap"><div data-vibewp-form="${token}"></div></div>
  <script src="/embed.js"></script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-store",
    },
  });
}
