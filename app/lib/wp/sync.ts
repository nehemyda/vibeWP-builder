/**
 * Three-way comparison between WordPress, VibeWP, and the state both sides last
 * agreed on.
 *
 * WHY THREE WAY AND NOT TWO
 *
 * Comparing WordPress against VibeWP can only report "these differ". It cannot
 * say which side moved, and therefore cannot tell a safe pull from a change that
 * would destroy someone's work. With a shared base — the schema stored at the
 * last successful sync — the four possible answers become distinguishable, and
 * only one of them needs a human.
 *
 * Everything here is pure so the classification can be tested without a
 * WordPress install.
 */

export type PageSyncState =
  /** Never exported; there is no WordPress page to reconcile with. */
  | "not_exported"
  /** Exported before sync tracking existed, so there is no agreed base. */
  | "never_synced"
  | "in_sync"
  /** Only WordPress moved — pulling is safe. */
  | "wp_ahead"
  /** Only VibeWP moved — pushing is safe. */
  | "vibe_ahead"
  /** Both moved. Needs a human; nothing is overwritten automatically. */
  | "conflict";

/**
 * Order-insensitive JSON, so key ordering never registers as a content change.
 * Undefined and null are folded together: WordPress cannot store "absent"
 * distinctly from "empty", and treating them as different would flag phantom
 * edits on every optional field.
 */
export function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        const inner = walk((v as Record<string, unknown>)[key]);
        // Drop empty values entirely rather than comparing null against absent.
        if (inner !== null && inner !== "") out[key] = inner;
      }
      return out;
    }
    if (typeof v === "string") return v.trim();
    return v;
  };
  return JSON.stringify(walk(value));
}

export function schemasEqual(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

/**
 * Reduces a schema to only what WordPress is capable of storing.
 *
 * WHY THIS IS NECESSARY
 *
 * VibeWP's schema is richer than a block document. `photographer` has nowhere
 * to live in Gutenberg markup, so it can never come back from a read. Compare
 * the raw schemas and that single field marks every page as diverged forever.
 *
 * Rather than maintaining a list of fields to ignore — which would go stale the
 * moment the schema grows — both sides are pushed through the same lossy
 * channel the real round trip uses: serialize, then parse. Whatever survives is
 * exactly what WordPress could have told us, so anything that differs afterwards
 * is a genuine content change.
 */
export function projectForSync(
  schema: unknown,
  serialize: (s: unknown) => string,
  parse: (html: string) => unknown | null,
): unknown {
  if (!schema) return null;
  const markup = serialize(schema);
  if (!markup) return null;
  return parse(markup);
}

export function classifyPage(opts: {
  wpPostId: number | null;
  /** Schema parsed out of WordPress; null when the page isn't there or is unreadable. */
  wpSchema: unknown | null;
  vibeSchema: unknown;
  /** The agreed state at last sync; null for pages that predate sync tracking. */
  baseSchema: unknown | null;
}): PageSyncState {
  const { wpPostId, wpSchema, vibeSchema, baseSchema } = opts;

  if (!wpPostId || wpSchema === null) return "not_exported";

  if (baseSchema === null || baseSchema === undefined) {
    /*
     * No base. If the two sides happen to match, nothing is at stake and this
     * is in_sync — the caller can safely adopt that as the base. If they differ
     * we genuinely cannot tell who moved, so it must not be guessed: a person
     * decides, exactly as with a real conflict.
     */
    return schemasEqual(wpSchema, vibeSchema) ? "in_sync" : "never_synced";
  }

  const wpMoved = !schemasEqual(wpSchema, baseSchema);
  const vibeMoved = !schemasEqual(vibeSchema, baseSchema);

  if (wpMoved && vibeMoved) return "conflict";
  if (wpMoved) return "wp_ahead";
  if (vibeMoved) return "vibe_ahead";
  return "in_sync";
}

/** True when pushing would discard work that only exists in WordPress. */
export function pushWouldOverwrite(state: PageSyncState): boolean {
  return state === "wp_ahead" || state === "conflict" || state === "never_synced";
}

export function describeState(state: PageSyncState): string {
  switch (state) {
    case "not_exported":
      return "Not exported to WordPress yet";
    case "never_synced":
      return "Never synced — WordPress and VibeWP differ and there's no shared history";
    case "in_sync":
      return "In sync";
    case "wp_ahead":
      return "Edited in WordPress since the last sync";
    case "vibe_ahead":
      return "Edited in VibeWP since the last sync";
    case "conflict":
      return "Edited in both WordPress and VibeWP since the last sync";
  }
}
