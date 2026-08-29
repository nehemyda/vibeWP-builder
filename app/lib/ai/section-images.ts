import { searchPhoto } from "@/lib/images/pexels";
import type { SectionDefinition } from "@/lib/sections/types";
import type { BusinessContext } from "./business-context";
import { photoQueryFor } from "./business-context";

/**
 * Fills the photographs a section needs — including one per list entry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY LIST ENTRIES NEEDED THEIR OWN PASS
 *
 * Page generation fills only a section's top-level image, and deliberately so:
 * one search query cannot produce twelve different subjects, and a gallery of
 * twelve identical photographs is worse than a gallery of none.
 *
 * That was fine while nothing asked for one. "A gallery with twelve photos"
 * asks for exactly that, so each entry gets its OWN query, drawn from a
 * different service where the client has listed several, and its own seed so
 * that repeats of the same query still return different pictures.
 *
 * Searches run in parallel — twelve sequential round trips is the difference
 * between a gallery appearing and a client watching a spinner.
 */
export async function fillSectionImages(opts: {
  section: SectionDefinition<Record<string, unknown>>;
  props: Record<string, unknown>;
  business: BusinessContext;
}): Promise<Record<string, unknown>> {
  const { section, props, business } = opts;
  const out = { ...props };

  const queries = queryPool(business);

  // Top-level image field, as page generation already does.
  const topLevel = Object.entries(section.fields).find(([, spec]) => spec.type === "image");
  if (topLevel) {
    const photo = await searchPhoto(queries[0], seed(business.businessName, 0));
    if (photo) out[topLevel[0]] = { url: photo.url, alt: photo.alt };
  }

  // Any list whose entries declare an image.
  for (const [fieldName, spec] of Object.entries(section.fields)) {
    if (spec.type !== "list" || !spec.of) continue;
    const imageKey = Object.entries(spec.of).find(([, s]) => s.type === "image")?.[0];
    if (!imageKey) continue;

    const items = Array.isArray(out[fieldName]) ? [...(out[fieldName] as Record<string, unknown>[])] : [];
    if (items.length === 0) continue;

    const photos = await Promise.all(
      items.map((item, i) =>
        searchPhoto(
          queries[i % queries.length],
          // Index is folded into the seed so the same query used twice in one
          // gallery still yields two different photographs.
          seed(`${business.businessName}:${i}`, i),
        ).then((photo) => ({ item, photo })),
      ),
    );

    out[fieldName] = photos.map(({ item, photo }) =>
      photo
        ? {
            ...item,
            [imageKey]: {
              url: photo.url,
              alt: photo.alt,
            },
          }
        : item,
    );
  }

  return out;
}

/**
 * Search terms for this business, most specific first.
 *
 * Services are the most specific true thing we know — a bakery that lists
 * "sourdough" and "wedding cakes" gets pictures of each, rather than twelve
 * shots of the same shopfront.
 */
function queryPool(business: BusinessContext): string[] {
  const pool = [...business.services.map((s) => s.trim()).filter(Boolean)];
  const fallback = photoQueryFor(business);
  if (pool.length === 0) pool.push(fallback);
  // A second pass of broader terms keeps a long gallery from repeating a short
  // service list too tightly.
  pool.push(fallback);
  if (business.categories) pool.push(business.categories.split(",")[0].trim());
  return pool.filter(Boolean);
}

function seed(key: string, salt: number): number {
  let h = salt * 7919;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}
