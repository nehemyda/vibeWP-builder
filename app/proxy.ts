import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { subdomainFromHost } from "@/lib/render/hosting";

/**
 * Paths that must keep meaning the same on every host.
 *
 * A Vibe site is served by THIS app through a rewrite, so its pages reference
 * /api/theme/sections.css, /media/... and /embed.js relatively and expect them
 * to answer. Rewriting those into the site renderer would ask it for a page called
 * "embed.js" — a 404, an unstyled site and a dead form. _next is the same
 * problem for the framework's own assets.
 */
const SHARED_PREFIXES = ["/_next/", "/api/", "/media/", "/embed.js", "/favicon.ico", "/forms/"];

export async function proxy(request: NextRequest) {
  /*
   * A request to <sub>.<VIBEWP_SITES_HOST> is a visitor asking for a client's
   * website, not a user of ours. It is answered by the renderer and never
   * touches the session refresh below: there is nothing to authenticate, and a
   * public page must not vary on whether some cookie happens to be present.
   *
   * Inert unless VIBEWP_SITES_HOST is set — subdomainFromHost returns null —
   * so on a deployment with no wildcard DNS this whole branch does not exist.
   */
  const subdomain = subdomainFromHost(request.headers.get("host"));
  const path = request.nextUrl.pathname;

  if (subdomain && !SHARED_PREFIXES.some((p) => path === p || path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = `/hosted/${subdomain}${path === "/" ? "" : path}`;

    /*
     * Tells the renderer this request arrived at the site's own address, so
     * it can mark the internal /hosted/... path noindex and leave the real one
     * indexable. Without it one page would compete with itself.
     */
    const headers = new Headers(request.headers);
    headers.set("x-vibe-site-host", request.headers.get("host") ?? "");

    return NextResponse.rewrite(url, { request: { headers } });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimization files,
     * so the Supabase session cookie stays refreshed across navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
