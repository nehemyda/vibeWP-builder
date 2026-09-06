/**
 * Finding every photograph in a section, wherever it is kept.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A WALK AND NOT props.image
 *
 * Most sections keep their photograph at `props.image`, and for a long time
 * everything that dealt with images assumed that was the only place one could
 * be. It is not: a gallery keeps them at `items.N.image`, alternating content
 * at `rows.N.image`, the showcase at `items.N.image`, and the featured service
 * at `featured.image` — nine placements across four families.
 *
 * The export walked only `props.image`, so those nine were never copied into
 * the client's WordPress media library. Their sites went live still loading
 * photographs from Pexels: not broken, but not theirs, and gone the day the
 * URL changes.
 *
 * So images are addressed the way text is — by a dotted path found by walking
 * the props — and the same map serves both the export and the canvas, which
 * needs to know WHICH photograph was clicked in order to replace only that
 * one.
 *
 * WHAT COUNTS AS AN IMAGE
 *
 * An object with a `url`. `alt` is not required: an image mid-upload may not
 * have one yet, and demanding it here would silently skip exactly the images
 * a client had just added.
 * ─────────────────────────────────────────────────────────────────────
 */

/** The shape a section stores a photograph in. */
export type ImageValue = {
  url: string;
  alt?: string;
  /** Set once the file lives in the client's WordPress media library. */
  id?: number;
  width?: number;
  height?: number;
  /** Attribution, when the photograph came from a stock library. */
  photographer?: string;
  photographerUrl?: string;
};

export type ImagePath = {
  /** e.g. "image", "items.2.image" */
  path: string;
  image: ImageValue;
};

const isImage = (v: unknown): v is ImageValue =>
  !!v && typeof v === "object" && typeof (v as ImageValue).url === "string";

/**
 * Every photograph in a set of props, in declaration order.
 *
 * Order is stable for the same reason textPaths' is: the serializer reads the
 * same object, so a walk in insertion order matches the order the images are
 * emitted.
 */
export function imagePaths(props: Record<string, unknown> | undefined): ImagePath[] {
  const out: ImagePath[] = [];

  const walk = (value: unknown, path: string) => {
    if (isImage(value)) {
      out.push({ path, image: value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, i) => walk(entry, `${path}.${i}`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  };

  for (const [key, value] of Object.entries(props ?? {})) walk(value, key);
  return out;
}

/**
 * Replaces one photograph, leaving every other one alone.
 *
 * Per-placement on purpose. The same file can be used in three sections, and
 * swapping the one you clicked is what a client means by "change this
 * picture" — changing all three would be a surprise they cannot undo
 * selectively.
 *
 * Merges rather than replaces, so attribution and dimensions that belong to
 * the NEW file arrive with it while anything the section itself set — a
 * caption field beside the image, say — survives.
 */
export function writeImage(
  props: Record<string, unknown>,
  path: string,
  image: ImageValue,
): Record<string, unknown> {
  const steps = path.split(".");
  const clone = (node: unknown): unknown =>
    Array.isArray(node) ? [...node] : node && typeof node === "object" ? { ...node } : node;

  const root = clone(props) as Record<string, unknown>;
  let node: Record<string, unknown> = root;
  for (let i = 0; i < steps.length - 1; i += 1) {
    const next = clone(node[steps[i]]);
    node[steps[i]] = next;
    node = next as Record<string, unknown>;
  }
  const last = steps[steps.length - 1];
  const before = node[last];
  /*
   * The old attribution must not outlive the old photograph. A stock credit
   * left behind on a client's own upload names a photographer who did not
   * take it — so those two fields are cleared unless the new image brings
   * its own.
   */
  const kept = isImage(before)
    ? { ...before, photographer: undefined, photographerUrl: undefined, id: undefined }
    : {};
  node[last] = { ...kept, ...image };
  return root;
}

/** Reads one photograph out of props, for confirming a path before writing. */
export function readImage(
  props: Record<string, unknown>,
  path: string,
): ImageValue | undefined {
  let node: unknown = props;
  for (const step of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[step];
  }
  return isImage(node) ? node : undefined;
}
