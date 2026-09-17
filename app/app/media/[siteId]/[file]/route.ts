import { localMediaStore, MEDIA_FILE } from "@/lib/media/store";

/**
 * A Vibe site's own images.
 *
 * Deliberately public and unauthenticated: these are the photographs on a
 * published website, fetched by visitors who have no account here.
 *
 * Every name is a content hash, so a URL can never point at different bytes
 * than it did yesterday — which is what makes the immutable cache header
 * honest rather than a bet. Changing a photograph produces a new URL; it
 * does not change what this one serves.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}

export async function GET(_request: Request, ctx: { params: Promise<{ siteId: string; file: string }> }) {
  const { siteId, file } = await ctx.params;

  /*
   * Both segments are validated before they are joined into a path. The store
   * checks again — a traversal here would read anything the process can — but
   * a bad request should be a 404 rather than a thrown error.
   */
  if (!UUID.test(siteId) || !MEDIA_FILE.test(file)) return notFound();

  const found = await localMediaStore.read(siteId, file);
  if (!found) return notFound();

  return new Response(new Uint8Array(found.data), {
    headers: {
      "Content-Type": found.contentType,
      "Content-Length": String(found.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      /* A client's photograph, indexed as part of their page and not as a file
         of ours sitting on a shared host. */
      "X-Content-Type-Options": "nosniff",
    },
  });
}
