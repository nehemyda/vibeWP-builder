/**
 * Finding the prop behind a piece of text on the page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY BY VALUE, AND NOT BY STAMPING EVERY FIELD
 *
 * To edit text in place, a click on the page has to become a write to one
 * prop — `heading`, or `items.2.body`. The obvious way is to stamp the path
 * onto each element as it is serialized.
 *
 * That would mean threading a path through every block primitive and every
 * one of the 62 sections, and it would put a builder attribute into a
 * client's exported WordPress content — which serialize.ts already refuses,
 * on the grounds that "a stray attribute in a client's WordPress content
 * would outlive us".
 *
 * So the map is built the other way round: enumerate the strings in the
 * props, walk the rendered DOM, and pair them by their text. Nothing is added
 * to the markup at all.
 *
 * WHAT MAKES THAT SAFE
 *
 * A mismatch cannot corrupt anything. This decides which element to make
 * editable and which path to send; the write itself goes through an operation
 * that validates the path against the stored props. The worst case is an
 * element that will not edit, not an edit landing in the wrong field.
 *
 * Duplicates are the real hazard — two services genuinely named "Delivery" —
 * so pairing is done in document order against props in declaration order,
 * and an element is claimed once. Identical strings therefore map to
 * themselves in the order they appear, which is the only defensible reading.
 * ─────────────────────────────────────────────────────────────────────
 */

/** A prop that holds editable text, addressed by a dotted path. */
export type TextPath = {
  /** e.g. "heading", "items.2.body" */
  path: string;
  value: string;
};

/** Keys whose strings are never body copy, so never editable in place. */
const NOT_TEXT = new Set([
  "url",
  "alt",
  "href",
  "variant",
  "kind",
  "featured",
  "id",
  "formToken",
  "image",
]);

/** Anything shorter than this is a marker, not prose worth an editor. */
const MIN_LENGTH = 1;

/**
 * Every editable string in a section's props, in declaration order.
 *
 * Order matters: it is half of the pairing rule, so it must be stable and it
 * must match the order the serializer emits. Object key order in JS is
 * insertion order, and the serializer reads the same object, so the two agree
 * by construction rather than by coincidence.
 */
export function textPaths(props: Record<string, unknown> | undefined): TextPath[] {
  const out: TextPath[] = [];

  const walk = (value: unknown, path: string, key: string) => {
    if (NOT_TEXT.has(key)) return;
    if (typeof value === "string") {
      const text = value.trim();
      /*
       * A {{token}} is not the client's text — it is a business detail
       * resolved at render time, and typing over it would replace a value
       * that follows the business record with a frozen copy of it.
       */
      if (text.length >= MIN_LENGTH && !/\{\{[a-z_]+\}\}/.test(text)) out.push({ path, value: text });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, i) => walk(entry, `${path}.${i}`, key));
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k, k);
      }
    }
  };

  for (const [key, value] of Object.entries(props ?? {})) walk(value, key, key);
  return out;
}

/**
 * Reads a dotted path out of props.
 *
 * Used by the operation to confirm the path names a string that is really
 * there before writing over it — the check that makes a wrong guess in the
 * pairing harmless.
 */
export function readPath(props: Record<string, unknown>, path: string): unknown {
  let node: unknown = props;
  for (const step of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[step];
  }
  return node;
}

/** Returns a copy of props with `path` set to `value`. Shallow-copies the way down. */
export function writePath(
  props: Record<string, unknown>,
  path: string,
  value: string,
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
  node[steps[steps.length - 1]] = value;
  return root;
}
