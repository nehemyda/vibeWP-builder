/**
 * Pexels photo search.
 *
 * Pexels is free for commercial use and requires no attribution, which is why
 * it's the default here rather than Unsplash — an agency handing a finished
 * site to a client shouldn't inherit a photographer-credit obligation.
 *
 * DEGRADATION IS THE POINT: every failure path returns null, and callers fall
 * back to the bundled placeholder. A photo lookup must never be the reason a
 * site fails to generate — no key, no network, rate limit and malformed
 * response all end the same way.
 */

export type StockPhoto = {
  url: string;
  alt: string;
  /** Not required by Pexels' licence, but stored so a credit can be shown if a client wants one. */
  photographer: string;
  photographerUrl: string;
  sourceId: number;
};

const ENDPOINT = "https://api.pexels.com/v1/search";
const TIMEOUT_MS = 6000;

export function pexelsConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

type PexelsPhoto = {
  id: number;
  alt: string | null;
  photographer: string;
  photographer_url: string;
  src: Record<string, string>;
};

/**
 * @param query    Search terms — see heroImageQuery() for how these are derived.
 * @param seed     Rotates which result is chosen so two sites in the same
 *                 vertical don't land on an identical photo.
 */
export async function searchPhoto(query: string, seed = 0): Promise<StockPhoto | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;

  const params = new URLSearchParams({
    query,
    // The theme frame is aspect-ratio 4/5, so a portrait crop loses least.
    orientation: "portrait",
    per_page: "15",
  });

  /**
   * Pexels' CDN converts on the fly, so asking for WebP costs us nothing and
   * roughly halves the transfer (measured: 14.5KB vs 29.9KB on the same photo).
   * The export path re-encodes to a real .webp file anyway — this is purely so
   * the builder preview isn't pulling down JPEGs.
   */
  const asWebp = (url: string) => (url.includes("fm=webp") ? url : `${url}&fm=webp`);

  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`[pexels] "${query}" → HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { photos?: PexelsPhoto[] };
    const photos = data.photos ?? [];
    if (photos.length === 0) return null;

    const photo = photos[seed % photos.length];

    // "large" is ~940px wide — enough for the hero frame without shipping a
    // 5MB original into someone's media library.
    const url = photo.src.large ?? photo.src.medium ?? photo.src.original;
    if (!url) return null;

    return {
      url: asWebp(url),
      // Pexels' own alt is a real description ("Dentist with protective gear
      // examining patient…"), which is far better than anything we'd invent.
      // Falling back to the search terms keeps this non-empty either way —
      // see requireAlt() for the guarantee that nothing empty ever ships.
      alt: photo.alt?.trim() || query,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      sourceId: photo.id,
    };
  } catch (err) {
    console.warn(`[pexels] "${query}" failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
