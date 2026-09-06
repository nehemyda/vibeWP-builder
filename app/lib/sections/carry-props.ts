import { parse } from "node-html-parser";
import { isOptionField, type FieldSpec, type SectionDefinition } from "./types";

/**
 * Moving a client's content from one section design to another.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS HARDER THAN COPYING MATCHING KEYS
 *
 * "Change this section's design" means: same words, different layout. The
 * obvious implementation — carry a field when the key matches and the declared
 * types agree — was written and run over every ordered pair of sections. It
 * throws on nothing and destroys content in six families:
 *
 *   contact-block → contact-cards      the phone number, email and address
 *                                      silently deleted; same information,
 *                                      `channels` list vs flat fields
 *   contact-hours → contact-block      the day-by-day hours table deleted
 *   content-gallery → content-alternating   renders as a bare <h2>
 *   content-alternating → content-gallery   every caption lost
 *   services-pricelist ⟷ faq-grouped   all 12 price lines gone; both declare
 *                                      `groups: list of {title, items}`
 *   features-grid → content-alternating     every row half-empty
 *
 * None of them reports a loss. That is the failure mode that matters: a swap
 * that looks like it worked and takes the client's telephone number off their
 * contact page.
 *
 * Two ideas fix all six.
 *
 * PROJECT, DON'T MATCH. Values are described by their ACTUAL shape, never by
 * `FieldSpec.type` — thirty list fields in the registry disagree with their own
 * `of` declaration, because `of` cannot nest, so a nested array is declared as
 * `text`. A source value is then projected, recursively, onto the shape of the
 * target's own sample, and everything that does not fit is REPORTED rather than
 * dropped on the floor.
 *
 * ASK THE RENDERER. Shape compatibility is a judgement call and we kept getting
 * it wrong, so the last word goes to the only thing that actually knows: after
 * projecting, the target is rendered and every carried string is looked for in
 * the output. A renderer that filters its own entries — content-alternating
 * keeps a row only if it has a title or body — discards the content silently,
 * and this is what notices. No shape heuristic caught that; rendering does.
 *
 * PURE, because it runs TWICE and the two must agree: client-side to draw an
 * honest preview of each candidate, and server-side to perform the swap. If it
 * disagreed with itself the client would be shown one thing and given another.
 * ─────────────────────────────────────────────────────────────────────
 */

type Props = Record<string, unknown>;
/* The same concrete parameterisation resolve.ts uses for a heterogeneous
   registry, rather than `any`. */
type AnySection = SectionDefinition<Record<string, unknown>>;

export type CarryResult = {
  /** What carries. Ready to hand to the target's toGutenberg. */
  props: Props;
  /**
   * Target content the swap could not fill, as field names and dotted paths
   * ("rows.image"). The caller writes these — with AI on the server, from the
   * target's own sample in a preview.
   */
  missing: string[];
  /**
   * Source content the target cannot hold, as dotted paths. This is what the
   * client is warned about BEFORE they click.
   */
  dropped: string[];
  /** Fields that carried only because an adapter reshaped them. */
  converted: string[];
};

/* ── shapes ────────────────────────────────────────────────────────── */

type Shape =
  | { kind: "nil" }
  | { kind: "text" }
  | { kind: "bool" }
  | { kind: "num" }
  | { kind: "image" }
  /** A plain object that is not an image. `keys` is what it holds. */
  | { kind: "object"; keys: string[] }
  | { kind: "strings" }
  | { kind: "records"; keys: string[] }
  /** An empty array — a list, but one that says nothing about its entries. */
  | { kind: "emptyList" };

const isRecord = (v: unknown): v is Props =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The shape of a value as it really is.
 *
 * `keys` on a list is the UNION across every entry, not the keys of entry
 * zero: conversion-pricing's sample tiers are internally inconsistent — the
 * middle tier carries `featured`, the outer two do not — so reading entry zero
 * silently strips the highlighted tier.
 */
export function describe(value: unknown): Shape {
  if (value === null || value === undefined || value === "") return { kind: "nil" };
  if (typeof value === "string") return { kind: "text" };
  if (typeof value === "boolean") return { kind: "bool" };
  if (typeof value === "number") return { kind: "num" };

  if (Array.isArray(value)) {
    const entries = value.filter((e) => e !== null && e !== undefined);
    if (entries.length === 0) return { kind: "emptyList" };
    if (entries.every((e) => typeof e === "string")) return { kind: "strings" };
    const keys = new Set<string>();
    for (const e of entries) if (isRecord(e)) Object.keys(e).forEach((k) => keys.add(k));
    return { kind: "records", keys: [...keys].sort() };
  }

  if (isRecord(value)) {
    // An image is an object with a url. Recognised by content rather than by
    // its field's declared type, for the same reason as everything else here.
    if (typeof value.url === "string") return { kind: "image" };
    return { kind: "object", keys: Object.keys(value).sort() };
  }
  return { kind: "nil" };
}

/** Whether two shapes are the same KIND of thing. Keys are not compared. */
function sameKind(a: Shape, b: Shape): boolean {
  if (a.kind === b.kind) return true;
  // An empty list is still a list, and tells us nothing to disagree with.
  const listy = (s: Shape) =>
    s.kind === "strings" || s.kind === "records" || s.kind === "emptyList";
  return listy(a) && listy(b) && (a.kind === "emptyList" || b.kind === "emptyList");
}

/* ── field roles ───────────────────────────────────────────────────── */

/**
 * Fields that do the same job under different names.
 *
 * Tried only when no exact key match exists. Keyed by section where a name is
 * ambiguous, because three of them are: `note` is small print in
 * conversion-logos and a supporting line in footer-simple, and `rows` is
 * {title, body, image} in content-alternating but a {point, us, them}
 * comparison triple in conversion-comparison. A flat synonym table would carry
 * a comparison table into an image row.
 */
type Role = "headline" | "sub" | "smallprint" | "entries";

const ROLE_BY_FIELD: Record<string, Role> = {
  heading: "headline",
  body: "sub",
  intro: "sub",
  blurb: "sub",
  items: "entries",
  steps: "entries",
  others: "entries",
  promises: "entries",
  cards: "entries",
  bullets: "entries",
  points: "entries",
  names: "entries",
  smallPrint: "smallprint",
  footnote: "smallprint",
};

/** `${sectionKey}.${fieldKey}` for the names that mean different things. */
const ROLE_BY_SECTION_FIELD: Record<string, Role> = {
  "cta-strip.text": "headline",
  "conversion-logos.note": "smallprint",
  "footer-simple.note": "sub",
  "header-topbar.note": "sub",
  "content-alternating.rows": "entries",
  // conversion-comparison.rows is deliberately absent: it is a comparison
  // triple, not a list of things, and has no counterpart anywhere.
};

function roleOf(sectionKey: string, field: string): Role | undefined {
  return ROLE_BY_SECTION_FIELD[`${sectionKey}.${field}`] ?? ROLE_BY_FIELD[field];
}

/**
 * Which source key to prefer when several fill one role. Fixed, so the client
 * preview and the server swap pick the same one.
 */
const ROLE_PREFERENCE = ["body", "intro", "blurb", "note", "text", "items", "steps", "rows"];

/* ── contact facts ─────────────────────────────────────────────────── */

/**
 * The four details that live on the business record rather than in copy. Held
 * as the literal token strings `{{phone}}` and friends, resolved by the theme
 * at render time and by withPreviewPlaceholders in the canvas.
 */
const FACT_FIELDS = ["phone", "email", "address", "hours"] as const;
/*
 * Not a type predicate on purpose. As `v is string` it narrowed the negative
 * branch of `fit`'s guard to `never`, so the truncation below stopped
 * type-checking.
 */
const isToken = (v: unknown): boolean => typeof v === "string" && /\{\{[a-z_]+\}\}/.test(v);

/* ── the form mount ────────────────────────────────────────────────── */

const mountsFormCache = new WeakMap<AnySection, boolean>();

/**
 * Whether a section embeds the client's form.
 *
 * Asked of the MARKUP, not of a list of six section keys. serialize.ts already
 * paid for that lesson: a key-based predicate there covered only FormEmbed, so
 * the five newer form sections previewed as an empty skeleton in the very
 * catalogue meant to sell them. This stays right when a seventh lands.
 */
export function mountsForm(def: AnySection): boolean {
  const cached = mountsFormCache.get(def);
  if (cached !== undefined) return cached;
  let answer = false;
  try {
    answer = def.toGutenberg(def.sample).includes("yp-embed__mount");
  } catch {
    answer = false;
  }
  mountsFormCache.set(def, answer);
  return answer;
}

/* ── projection ────────────────────────────────────────────────────── */

type Projection =
  | { ok: true; value: unknown; dropped: string[]; missing: string[]; converted: boolean }
  | { ok: false };

/**
 * Reshapes a source value to fit the target's shape, recursively.
 *
 * `dropped` and `missing` come back as paths relative to the field, so
 * `features-grid.items` → `content-alternating.rows` reports "rows.image" as
 * missing — which is what lets the caller fill it rather than publish a row of
 * copy in the left half of a two-column grid.
 *
 * Refuses (ok: false) when the kinds disagree, and — the case that matters —
 * when a nested LIST cannot be projected. A group whose items are gone is not
 * a group: that is what turned twelve price lines into three bare headings.
 */
function project(source: unknown, targetSample: unknown, path: string): Projection {
  const from = describe(source);
  const to = describe(targetSample);

  if (from.kind === "nil") return { ok: false };
  // Fail closed when there is nothing to compare against. Allowing it put
  // "[object Object]" into content-checklist's items.
  if (to.kind === "nil") return { ok: false };
  if (!sameKind(from, to)) return { ok: false };

  if (from.kind === "text" || from.kind === "bool" || from.kind === "num" || from.kind === "image") {
    return { ok: true, value: source, dropped: [], missing: [], converted: false };
  }

  if (from.kind === "strings") {
    return { ok: true, value: source, dropped: [], missing: [], converted: false };
  }

  // Objects and lists of objects both project onto the target's key union.
  const targetKeys = to.kind === "records" || to.kind === "object" ? to.keys : [];
  if (targetKeys.length === 0) {
    return { ok: true, value: source, dropped: [], missing: [], converted: false };
  }

  const sampleEntry = to.kind === "records" ? firstRecord(targetSample) : (targetSample as Props);
  const entries = from.kind === "object" ? [source as Props] : (source as unknown[]);
  /*
   * Which nested keys the target expects on EVERY entry.
   *
   * Only those are worth reporting as missing. conversion-pricing's sample
   * marks one tier of three as `featured`, so treating every key of the merged
   * entry as required told a section its own content was incomplete.
   */
  const universal = universalKeys(targetSample, targetKeys);

  const dropped = new Set<string>();
  const missing = new Set<string>();
  const out: Props[] = [];

  for (const raw of entries) {
    if (!isRecord(raw)) continue;
    const projected: Props = {};

    for (const key of targetKeys) {
      const inner = project(raw[key], sampleEntry?.[key], `${path}.${key}`);
      if (inner.ok) {
        projected[key] = inner.value;
        inner.dropped.forEach((d) => dropped.add(d));
        inner.missing.forEach((m) => missing.add(m));
      } else {
        // A nested list that will not project is content, not decoration.
        // Refusing the whole field is what keeps a price list from becoming
        // three headings with nothing under them.
        const innerShape = describe(raw[key]);
        if (innerShape.kind === "records" || innerShape.kind === "strings") return { ok: false };
        if (universal.has(key)) missing.add(`${path}.${key}`);
      }
    }

    for (const key of Object.keys(raw)) {
      if (!targetKeys.includes(key) && describe(raw[key]).kind !== "nil") {
        dropped.add(`${path}.${key}`);
      }
    }
    out.push(projected);
  }

  if (out.length === 0) return { ok: false };

  /*
   * Nothing survived the projection. features-grid's {title, body} entries
   * projected onto testimonials' {name, quote, role} produced three entries
   * with every key undefined — a section rendering three empty quote cards,
   * reporting no loss. Refusing sends the field to `missing` instead, where
   * something will actually write it.
   */
  const anyContent = out.some((entry) =>
    Object.values(entry).some((v) => describe(v).kind !== "nil"),
  );
  if (!anyContent) return { ok: false };

  return {
    ok: true,
    value: from.kind === "object" ? out[0] : out,
    dropped: [...dropped],
    missing: [...missing],
    converted: false,
  };
}

/** Keys the target's sample carries on every one of its entries. */
function universalKeys(targetSample: unknown, keys: string[]): Set<string> {
  const entries = (Array.isArray(targetSample) ? targetSample : [targetSample]).filter(isRecord);
  if (entries.length === 0) return new Set(keys);
  return new Set(
    keys.filter((key) => entries.every((e) => describe(e[key]).kind !== "nil")),
  );
}

function firstRecord(list: unknown): Props | undefined {
  if (!Array.isArray(list)) return isRecord(list) ? list : undefined;
  /*
   * Merged rather than taken from entry zero, so an optional key present only
   * on a later entry is still projectable — conversion-pricing's `featured`
   * appears on the middle tier alone.
   */
  const merged: Props = {};
  for (const e of list) {
    if (!isRecord(e)) continue;
    for (const [k, v] of Object.entries(e)) {
      if (merged[k] === undefined || describe(merged[k]).kind === "nil") merged[k] = v;
    }
  }
  return merged;
}

/* ── adapters ──────────────────────────────────────────────────────── */

/**
 * The four reshapings the registry actually needs.
 *
 * Everything else is a rename (the role table) or a refusal. These exist
 * because the same information is genuinely stored two ways in one category,
 * and no amount of key matching bridges that.
 */

const CHANNEL_LABEL: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  address: "Address",
  hours: "Hours",
};

/** Flat {phone, email, address, hours} → channels: [{label, value, kind}]. */
function factsToChannels(source: Props): Array<{ label: string; value: string; kind: string }> {
  const out: Array<{ label: string; value: string; kind: string }> = [];
  for (const field of FACT_FIELDS) {
    const value = source[field];
    if (typeof value !== "string" || !value.trim()) continue;
    out.push({
      label: CHANNEL_LABEL[field],
      value,
      kind: field === "phone" || field === "email" ? field : "text",
    });
  }
  return out;
}

/**
 * What a client might have called each channel.
 *
 * `kind` identifies a phone and an email and nothing else — an address and a
 * set of opening hours are both `"text"` — and the label is free copy the
 * client wrote. Our own sample says "Visit us" and "Opening hours", so exact
 * label matching found neither, and an address survived a swap only as far as
 * whoever wrote the replacement.
 *
 * A guess, and a cheap one. If it guesses wrong the field simply goes to
 * `missing` and is written properly, which is where it was already headed.
 */
const CHANNEL_HINTS: Record<string, string[]> = {
  phone: ["phone", "call", "tel", "mobile", "ring"],
  email: ["email", "e-mail", "mail"],
  address: ["address", "visit", "where", "find us", "location", "postal", "studio", "shop"],
  hours: ["hours", "open", "times", "when"],
};

/** channels → one flat fact, matched on `kind` first and the label second. */
function channelToFact(channels: unknown, field: string): string | undefined {
  if (!Array.isArray(channels)) return undefined;
  const hints = CHANNEL_HINTS[field] ?? [field];

  // `kind` is authoritative where it exists, so it is checked across the whole
  // list before any label is consulted.
  for (const raw of channels) {
    if (!isRecord(raw)) continue;
    if (raw.kind === field && typeof raw.value === "string") return raw.value;
  }
  for (const raw of channels) {
    if (!isRecord(raw)) continue;
    const label = typeof raw.label === "string" ? raw.label.toLowerCase() : "";
    if (!label) continue;
    // A phone channel must not be claimed by another field's hint.
    if (raw.kind === "phone" && field !== "phone") continue;
    if (raw.kind === "email" && field !== "email") continue;
    if (hints.some((hint) => label.includes(hint))) {
      return typeof raw.value === "string" ? raw.value : undefined;
    }
  }
  return undefined;
}

/**
 * hours: [{day, time}] → one line.
 *
 * One direction only. Going back the other way — splitting a line into days —
 * guesses at where the day ends, and guessing wrong writes nonsense into the
 * client's opening hours. So a string source reports `hours` as MISSING and
 * hands the string to whoever writes the replacement, which is both honest and
 * better: they can read "Tue–Sat, 9am–5pm" and produce real rows.
 */
function hoursToText(rows: unknown): string | undefined {
  if (!Array.isArray(rows)) return undefined;
  const parts = rows
    .filter(isRecord)
    .map((r) => [r.day, r.time].filter((v) => typeof v === "string" && v.trim()).join(" "))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** groups: [{title, items}] → a flat entry list, and back. */
function flattenGroups(groups: unknown): unknown[] | undefined {
  if (!Array.isArray(groups)) return undefined;
  const out: unknown[] = [];
  for (const g of groups) {
    if (!isRecord(g) || !Array.isArray(g.items)) continue;
    out.push(...g.items);
  }
  return out.length ? out : undefined;
}

/** A one-key record list ⟷ a plain string list, e.g. bullets:[{text}]. */
function unwrapSingleKey(list: unknown): string[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const out: string[] = [];
  for (const e of list) {
    if (typeof e === "string") out.push(e);
    else if (isRecord(e)) {
      const values = Object.values(e).filter((v) => typeof v === "string" && v.trim());
      if (values.length === 1) out.push(values[0] as string);
      else return undefined;
    }
  }
  return out.length ? out : undefined;
}

function wrapSingleKey(strings: unknown, key: string): Props[] | undefined {
  if (!Array.isArray(strings)) return undefined;
  const out = strings.filter((s) => typeof s === "string" && s.trim()).map((s) => ({ [key]: s }));
  return out.length ? out : undefined;
}

/* ── the render check ──────────────────────────────────────────────── */

/**
 * Keys whose strings never reach the page as text.
 *
 * Without this every carried image would be reported as discarded, because an
 * alt attribute is not body copy and a href is not a sentence.
 */
/**
 * Fields describing the section's OWN STRUCTURE rather than its content.
 *
 * Neither content nor a setting, and so a third category. partOrder names
 * the parts of one design in one arrangement — carry it into a design built
 * from different parts and it means nothing, which is the same reason a
 * layout choice is not carried either. But unlike a setting it is also not
 * something to default: the target's natural order is what "unset" already
 * means.
 *
 * Dropped silently, because there is nothing to tell the client. Reported as
 * lost, the swap gate rightly complained that "heading,body,actions" had gone
 * missing — words no one wrote and no one will miss.
 */
export const STRUCTURAL_FIELDS = new Set(["partOrder"]);

const ATTRIBUTE_ONLY = new Set([
  "url",
  "alt",
  "href",
  "variant",
  "kind",
  "featured",
  "id",
  // The form's handle rides in a data attribute, not in the page's words.
  "formToken",
]);

/**
 * Every string in a value that a reader should be able to see.
 *
 * Exported because the gate needs exactly this judgement; its own copy of it
 * diverged the moment carry-props learned that an image's strings are not
 * copy, and reported 107 false failures.
 */
export function visibleStrings(value: unknown, key?: string): string[] {
  if (key && ATTRIBUTE_ONLY.has(key)) return [];
  /*
   * NOTHING inside an image is body copy.
   *
   * The declared keys are all attributes, but a stored image also carries
   * whatever the photo lookup put there — a real hero on a client's site holds
   * `photographer: "Kate Filatova"` and `photographerUrl`, neither of which
   * renders. Listing keys one by one missed both, so the removal test read the
   * photograph as content that had vanished and threw it away on every swap.
   * Samples never showed it: they have no credit metadata.
   */
  if (describe(value).kind === "image") return [];
  if (typeof value === "string") return value.trim().length > 3 ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((v) => visibleStrings(v, key));
  if (isRecord(value)) return Object.entries(value).flatMap(([k, v]) => visibleStrings(v, k));
  return [];
}

/* ── truncation ────────────────────────────────────────────────────── */

/**
 * Fits copy to the target's own limit, on a word boundary.
 *
 * A {{token}} is never cut: `{{addr` is a literal the theme's filter cannot
 * resolve and the preview's strip regex cannot remove, so it would be printed
 * on the page exactly like that.
 */
function fit(value: unknown, spec: FieldSpec | undefined): unknown {
  const max = spec?.maxChars;
  if (typeof value !== "string" || !max || value.length <= max || isToken(value)) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, "");
}

/* ── carryProps ────────────────────────────────────────────────────── */

/**
 * Moves `fromProps` into the shape `to` expects.
 *
 * Deliberately does NOT fill `missing` from the target's sample. The answer has
 * to be identical on the client and the server, and only the server can write
 * real copy — a preview that quietly padded itself with sample content would
 * promise words the swap does not deliver. Padding is the preview caller's job.
 */
export function carryProps(from: AnySection, fromProps: Props, to: AnySection): CarryResult {
  const props: Props = {};
  const missing = new Set<string>();
  const dropped = new Set<string>();
  const converted = new Set<string>();
  /** Source keys spent on a target field, and so unavailable to another. */
  const used = new Set<string>();
  /**
   * Source keys that are accounted for but NOT spent.
   *
   * Two distinct things, and conflating them broke the contact swap both ways:
   * `channels` has to stay readable while all four of phone, email, address and
   * hours draw from it, and a field whose projection was refused still reaches
   * whoever writes the replacement, so it is not something the client lost.
   */
  const explained = new Set<string>();

  const source = fromProps ?? {};
  const targetSample = (to.sample ?? {}) as Props;

  for (const [field, spec] of Object.entries(to.fields)) {
    /*
     * Settings are not content. Carried only when the source has the very same
     * setting; otherwise the target's own default, because a layout choice made
     * for one design says nothing about another.
     */
    if (STRUCTURAL_FIELDS.has(field)) continue;

    if (isOptionField(spec)) {
      const mine = source[field];
      if (mine !== undefined && sameKind(describe(mine), describe(targetSample[field]))) {
        props[field] = mine;
        used.add(field);
      } else if (spec.default !== undefined) {
        props[field] = spec.default;
      }
      continue;
    }

    /*
     * Candidates in priority order, and EVERY one is tried against the
     * projection. Stopping at the first candidate — the field of the same name
     * — is what stopped contact-hours' day-by-day rows ever reaching the
     * adapter that turns them into a line: `hours` matched `hours`, the shapes
     * disagreed, and the swap gave up on a conversion sitting right there.
     */
    let filled = false;
    for (const found of findSources(from, source, to, field, used)) {
      found.explain?.forEach((key) => explained.add(key));

      const projected = project(found.value, targetSample[field], field);
      if (!projected.ok) continue;

      props[field] = fit(projected.value, spec);
      projected.dropped.forEach((d) => dropped.add(d));
      projected.missing.forEach((m) => missing.add(m));
      if (found.viaAdapter) converted.add(field);
      found.consume?.forEach((key) => used.add(key));
      filled = true;
      break;
    }

    if (!filled) {
      missing.add(field);
      /*
       * Explained, not spent. Whoever writes the replacement is handed the
       * source props, so reporting this as dropped would tell the client their
       * opening hours were thrown away moments before we hand them over — and
       * leaving it unspent lets it still fill a different field.
       */
      for (const found of findSources(from, source, to, field, used)) {
        found.consume?.forEach((key) => explained.add(key));
      }
    }
  }

  /*
   * The form's identity handle. Not a declared field on any section — it is a
   * handle, not copy — so nothing above would carry it, and a form→form swap
   * would mount a form bound to nothing.
   */
  if (mountsForm(to) && mountsForm(from) && typeof source.formToken === "string" && source.formToken) {
    props.formToken = source.formToken;
  }
  // Either way the handle is not the client's copy, so it is never reported as
  // something they lost — a form that moves off the page is the swap they asked
  // for, not a deletion they need warning about.
  explained.add("formToken");

  /* Ask the renderer. See the note at the top of this file. */
  for (let pass = 0; pass < 3; pass += 1) {
    const ghosts = findGhosts(to, props);
    if (ghosts.length === 0) break;
    for (const field of ghosts) {
      delete props[field];
      converted.delete(field);
      // Its nested reports go with it: there is no "rows.image" to fill once
      // there are no rows.
      for (const path of [...dropped]) if (path.startsWith(`${field}.`)) dropped.delete(path);
      for (const path of [...missing]) if (path.startsWith(`${field}.`)) missing.delete(path);
      missing.add(field);
    }
  }

  /* Whatever the target never asked for, and nothing will write. */
  for (const [key, value] of Object.entries(source)) {
    if (used.has(key) || explained.has(key)) continue;
    if (describe(value).kind === "nil") continue;
    const spec = from.fields[key];
    if (STRUCTURAL_FIELDS.has(key) || (spec && isOptionField(spec))) continue;
    dropped.add(key);
  }

  return {
    props,
    missing: [...missing].sort(),
    dropped: [...dropped].sort(),
    converted: [...converted].sort(),
  };
}

/**
 * Where one target field's content comes from: the fact of the same name, then
 * the same key, then the same role, then an adapter.
 *
 * `consume` is spent (unavailable to another field); `explain` is only
 * accounted for, so several fields may draw on it.
 */
type Found = {
  value: unknown;
  consume?: string[];
  explain?: string[];
  viaAdapter?: boolean;
};

function findSources(
  from: AnySection,
  source: Props,
  to: AnySection,
  field: string,
  used: Set<string>,
): Found[] {
  const free = (key: string) => !used.has(key) && describe(source[key]).kind !== "nil";
  const out: Found[] = [];

  /*
   * The field of the same name, first. For a business detail this is the only
   * acceptable answer: it is a fact, not a sentence, so it must never be
   * role-matched into a prose slot, and its {{token}} form has to arrive whole
   * or the theme cannot resolve it.
   */
  if (free(field)) out.push({ value: source[field], consume: [field] });

  if (!(FACT_FIELDS as readonly string[]).includes(field)) {
    const wanted = roleOf(to.key, field);
    if (wanted) {
      const byRole = Object.keys(from.fields)
        .filter((key) => key !== field && free(key) && roleOf(from.key, key) === wanted)
        // A fact never fills a prose slot, however the roles line up.
        .filter((key) => !(FACT_FIELDS as readonly string[]).includes(key))
        .filter((key) => !isOptionField(from.fields[key]))
        .sort((a, b) => rank(a) - rank(b));
      for (const key of byRole) out.push({ value: source[key], consume: [key] });
    }
  }

  const adapted = adapt(from, source, to, field, free);
  if (adapted) out.push(adapted);
  return out;
}

function rank(key: string): number {
  const at = ROLE_PREFERENCE.indexOf(key);
  return at < 0 ? ROLE_PREFERENCE.length : at;
}

/** The four reshapings, tried only once matching by name and role has failed. */
function adapt(
  from: AnySection,
  source: Props,
  to: AnySection,
  field: string,
  free: (key: string) => boolean,
): Found | undefined {
  const targetSample = (to.sample ?? {}) as Props;
  const targetShape = describe(targetSample[field]);

  /*
   * 1. Flat contact facts ⟷ channels.
   *
   * The same four details, stored two orthogonal ways inside one category:
   * contact-cards and contact-band hold them as a labelled list, the other four
   * Contact sections as separate fields. No key or role match bridges that, and
   * without this adapter every swap across the line deleted the client's phone
   * number, email and address while reporting nothing.
   *
   * `channels` is EXPLAINED rather than spent, because all four fact fields
   * draw from the same list.
   */
  if (field === "channels") {
    const built = factsToChannels(source);
    if (built.length) {
      return {
        value: built,
        consume: FACT_FIELDS.filter((f) => typeof source[f] === "string" && source[f]),
        viaAdapter: true,
      };
    }
  }
  if ((FACT_FIELDS as readonly string[]).includes(field) && free("channels")) {
    const value = channelToFact(source.channels, field);
    if (value) return { value, explain: ["channels"], viaAdapter: true };
  }

  // 2. hours rows → one line. The reverse is deliberately absent; see hoursToText.
  if (field === "hours" && targetShape.kind === "text" && free("hours")) {
    const line = hoursToText(source.hours);
    if (line) return { value: line, consume: ["hours"], viaAdapter: true };
  }

  // 3. grouped entries ⟷ flat entries
  if (roleOf(to.key, field) === "entries" && free("groups")) {
    const flat = flattenGroups(source.groups);
    if (flat) return { value: flat, consume: ["groups"], viaAdapter: true };
  }
  if (field === "groups" && targetShape.kind === "records") {
    const entryKey = entriesKey(from, free);
    if (entryKey) {
      // The topic name is the one thing a flat list cannot supply, so it is
      // left for whoever writes the replacement rather than invented here.
      return {
        value: [{ title: "", items: source[entryKey] }],
        consume: [entryKey],
        viaAdapter: true,
      };
    }
  }

  // 4. one-key records ⟷ plain strings
  if (targetShape.kind === "strings" || targetShape.kind === "records") {
    const entryKey = entriesKey(from, free);
    if (entryKey) {
      const mine = describe(source[entryKey]);
      if (targetShape.kind === "strings" && mine.kind === "records") {
        const flat = unwrapSingleKey(source[entryKey]);
        if (flat) return { value: flat, consume: [entryKey], viaAdapter: true };
      }
      if (targetShape.kind === "records" && mine.kind === "strings" && targetShape.keys.length === 1) {
        const wrapped = wrapSingleKey(source[entryKey], targetShape.keys[0]);
        if (wrapped) return { value: wrapped, consume: [entryKey], viaAdapter: true };
      }
    }
  }

  return undefined;
}

/** The source's own list-of-things field, whatever it happens to be called. */
function entriesKey(from: AnySection, free: (key: string) => boolean): string | undefined {
  return Object.keys(from.fields)
    .filter((key) => free(key) && roleOf(from.key, key) === "entries")
    .sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * Fields whose content the target's renderer throws away.
 *
 * The only reliable authority on whether a section will actually SHOW a value
 * is the section. content-alternating keeps a row only when it has a title or
 * a body; faq-grouped keeps an entry only when it has a question. Both discard
 * silently, and both were carrying content into oblivion until this asked.
 */
function findGhosts(to: AnySection, props: Props): string[] {
  const render = (p: Props): string | undefined => {
    try {
      return to.toGutenberg(p);
    } catch {
      /*
       * A section that will not render at all is not evidence about any one
       * field, so nothing is blamed. Totality is asserted separately, and a
       * throw here would take the whole preview down with it.
       */
      return undefined;
    }
  };

  const full = render(props);
  if (full === undefined) return [];
  const text = parse(full).textContent;

  const ghosts: string[] = [];
  for (const [field, value] of Object.entries(props)) {
    if (describe(value).kind === "nil") continue;
    /*
     * Settings are exempt. A setting that equals the design's default produces
     * byte-identical markup whether it is present or not — `sticky: true` is
     * the header's default — so the removal test reads every such option as
     * content that vanished.
     */
    const spec = to.fields[field];
    if (STRUCTURAL_FIELDS.has(field) || (spec && isOptionField(spec))) continue;

    /*
     * Does removing it change anything at all?
     *
     * This is the test that no shape rule could replace. content-alternating
     * keeps a row only when it has a title or a body, so a gallery's
     * image-only entries carried into it changed the markup not one byte —
     * three photographs and their captions published as a bare <h2>, reported
     * as a clean swap. Comparing MARKUP rather than text matters: an image
     * legitimately contributes no words, but it does contribute an <img>.
     */
    const without = { ...props };
    delete without[field];
    const trimmed = render(without);
    if (trimmed !== undefined && trimmed === full) {
      ghosts.push(field);
      continue;
    }

    // And does what it says reach the reader? Tokens are resolved downstream,
    // so their literal form is what appears here.
    const strings = visibleStrings(value, field);
    if (strings.length && !strings.every((s) => text.includes(s))) ghosts.push(field);
  }
  return ghosts;
}
