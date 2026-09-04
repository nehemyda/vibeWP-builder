"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { getSectionByKey } from "@/lib/sections";
import { carryProps } from "@/lib/sections/carry-props";
import { withPreviewPlaceholders, type FormPreviewField } from "@/lib/wp/serialize";
import { CandidatePreview } from "./CandidatePreview";
import type { CanvasSelection } from "./PreviewFrame";
import styles from "./builder.module.css";

/** What the server allows on this site's plan, with the admin's names. */
export type CatalogueEntry = {
  key: string;
  nodeType: string;
  name: string;
  description: string;
  category: string;
};

/** Everything the placeholder substitution needs, so a card looks like the page. */
export type PreviewContext = {
  siteName: string;
  facts: Record<string, string>;
  logoUrl?: string;
  pages: { slug: string; title: string }[];
  formFields: FormPreviewField[];
  formToken?: string;
  formStyle: Record<string, string>;
  colors?: Record<string, string>;
};

type Fit = {
  entry: CatalogueEntry;
  /** Markup for the card: what carries, padded with this design's own sample. */
  html: string;
  /** Nothing to write and nothing lost. */
  dropIn: boolean;
  /** Human labels for what has to be written, and what will not fit. */
  writes: string[];
  loses: string[];
};

/**
 * Choosing a different design for the selected section.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A GRID OF THE LIBRARY
 *
 * Three decisions, each of which the obvious version gets wrong.
 *
 * IT SHOWS THE CLIENT'S OWN CONTENT. Every card renders the section's real
 * copy and photograph through carryProps — the same function the swap itself
 * uses, so what is shown is what will happen. A catalogue of stock samples
 * would be the section library with extra steps, and would not answer the
 * question being asked, which is "how would MY page look like that".
 *
 * IT IS RANKED BY FIT, NOT BY CATEGORY. Category alone is the wrong axis:
 * Content holds eleven sections of wildly different shape, Social proof holds
 * exactly one, and the six form sections share Contact with six that have no
 * form. So each card says what the swap will cost — nothing, some new copy, or
 * a named thing that will not fit — and the ones that cost nothing come first.
 *
 * IT SAYS WHAT WILL BE LOST BEFORE THE CLICK. carryProps computes it exactly;
 * having computed it, showing it is the only honest option.
 *
 * The panel takes the chat pane's slot, which already has a collapsed state
 * and its own mobile behaviour, so the shell layout is untouched and chat is
 * one click away — "now make it match the hero" is the natural next sentence.
 * ─────────────────────────────────────────────────────────────────────
 */
export function DesignPanel({
  selection,
  currentKey,
  currentProps,
  catalogue,
  context,
  busy,
  originKey,
  onPick,
  onClose,
}: {
  selection: CanvasSelection;
  /** Registry key of the design in place now. */
  currentKey: string;
  currentProps: Record<string, unknown>;
  catalogue: CatalogueEntry[];
  context: PreviewContext;
  busy?: boolean;
  /**
   * The design this section had when the panel was first opened.
   *
   * Offered as the first card whenever it is no longer in place, so trying six
   * designs does not mean six presses of undo to get back. Session-only: the
   * durable route back is the revision history.
   */
  originKey?: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [cardWidth, setCardWidth] = useState(320);
  const list = useRef<HTMLDivElement>(null);

  const current = getSectionByKey(currentKey);
  const placement = current?.placement ?? "page";

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => setCardWidth(Math.max(160, el.clientWidth - 2));
    measure();
    // The panel is full-width on a phone and 380px on a desktop, and the
    // scale factor every card renders at comes from this number.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const fits = useMemo<Fit[]>(() => {
    if (!current) return [];
    return catalogue
      .filter((entry) => {
        const def = getSectionByKey(entry.key);
        if (!def || entry.key === currentKey) return false;
        // A header can never stand in for a page section, and the swap
        // operations refuse it — so it must not be offered here either.
        return (def.placement ?? "page") === placement;
      })
      .map((entry) => {
        const def = getSectionByKey(entry.key)!;
        const carried = carryProps(current, currentProps, def);

        /*
         * The card is padded with this design's own sample for anything that
         * still has to be written. carryProps deliberately does not do this —
         * it has to give the same answer on the server, where the copy is
         * written for real — so it happens here, and the card says which
         * parts are stand-ins.
         */
        const padded = { ...carried.props };
        const sample = (def.sample ?? {}) as Record<string, unknown>;
        for (const path of carried.missing) {
          const field = path.split(".")[0];
          if (padded[field] === undefined && sample[field] !== undefined) {
            padded[field] = sample[field];
          }
        }

        const label = (path: string) => {
          const [field] = path.split(".");
          return (def.fields[field]?.label ?? current.fields[field]?.label ?? field).toLowerCase();
        };
        const unique = (values: string[]) => values.filter((v, i, all) => all.indexOf(v) === i);

        return {
          entry,
          html: withPreviewPlaceholders(
            def.toGutenberg(padded),
            context.siteName,
            context.facts,
            context.logoUrl,
            context.pages,
            context.formFields,
            context.formToken,
            context.formStyle,
          ),
          dropIn: carried.missing.length === 0 && carried.dropped.length === 0,
          writes: unique(carried.missing.map(label)),
          loses: unique(carried.dropped.map(label)),
        };
      })
      .sort((a, b) => {
        // Costless first, then the ones that only add, then the lossy ones.
        const rank = (f: Fit) => (f.dropIn ? 0 : f.loses.length === 0 ? 1 : 2);
        return rank(a) - rank(b) || a.entry.name.localeCompare(b.entry.name);
      });
  }, [catalogue, current, currentKey, currentProps, placement, context]);

  const needle = query.trim().toLowerCase();
  const sameCategory = fits.filter((f) => f.entry.category === current?.category);
  const otherCategory = fits.filter((f) => f.entry.category !== current?.category);
  const shown = needle
    ? fits.filter(
        (f) =>
          f.entry.name.toLowerCase().includes(needle) ||
          f.entry.description.toLowerCase().includes(needle) ||
          f.entry.category.toLowerCase().includes(needle),
      )
    : showAll
      ? fits
      : sameCategory;

  /*
   * When everything is on screen, fit ranking would interleave the categories
   * — a hero, then a footer, then a hero — so the list is ordered by category
   * instead, with the fit ranking kept inside each one.
   */
  const groupHeadings = Boolean(needle) || showAll;
  const ordered = groupHeadings
    ? [...shown].sort(
        (a, b) =>
          a.entry.category.localeCompare(b.entry.category) ||
          (a.dropIn ? 0 : a.loses.length === 0 ? 1 : 2) - (b.dropIn ? 0 : b.loses.length === 0 ? 1 : 2) ||
          a.entry.name.localeCompare(b.entry.name),
      )
    : shown;

  const originEntry =
    originKey && originKey !== currentKey ? catalogue.find((e) => e.key === originKey) : undefined;

  return (
    <section className={styles.designPanel} aria-label="Change this section's design">
      <header className={styles.designHeader}>
        <div>
          <strong className={styles.designTitle}>Change design</strong>
          <span className={styles.designSubtitle}>
            {selection.kind === "chrome"
              ? `Your site's ${selection.slot}`
              : (current?.name ?? "This section")}
          </span>
        </div>
        <button type="button" className={styles.designClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className={styles.designSearch}>
        <input
          type="search"
          value={query}
          placeholder={`Search ${fits.length} designs`}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search designs"
        />
      </div>

      <div className={styles.designList} ref={list} data-vibewp-scroller>
        {originEntry && (
          <button
            type="button"
            className={`${styles.designCard} ${styles.designCardBack}`}
            disabled={busy}
            onClick={() => onPick(originEntry.key)}
          >
            <span className={styles.designCardName}>Back to how it was</span>
            <span className={styles.designCardNote}>{originEntry.name}</span>
          </button>
        )}

        {ordered.map((fit, i) => (
          <Fragment key={fit.entry.key}>
            {/*
              A category heading whenever the run changes. Only ever visible in
              the browse-all and search lists, where fifty-one cards under no
              headings at all was a wall with no way into it — the same-category
              list is one run and gets none.
            */}
            {groupHeadings && fit.entry.category !== ordered[i - 1]?.entry.category && (
              <p className={styles.designGroup}>{fit.entry.category}</p>
            )}
          <button
            type="button"
            className={styles.designCard}
            disabled={busy}
            onClick={() => onPick(fit.entry.key)}
          >
            <CandidatePreview
              html={fit.html}
              colors={context.colors}
              width={cardWidth}
              // The cards that are visible on open render straight away, so the
              // panel never appears as a column of empty boxes.
              eager={i < 4}
            />
            <span className={styles.designCardName}>{fit.entry.name}</span>
            {/*
              What this costs, in the client's words. "Drop-in" is the whole
              point of ranking: most swaps within a category are free, and
              saying so is what makes trying five of them feel safe.
            */}
            {fit.dropIn ? (
              <span className={`${styles.designCardNote} ${styles.designCardFree}`}>
                Keeps everything · applies instantly
              </span>
            ) : (
              <span className={styles.designCardNote}>
                {fit.writes.length > 0 && `We'll write the ${listWords(fit.writes)}`}
                {fit.writes.length > 0 && fit.loses.length > 0 && " · "}
                {fit.loses.length > 0 && (
                  <em className={styles.designCardLoses}>no {listWords(fit.loses)}</em>
                )}
              </span>
            )}
          </button>
          </Fragment>
        ))}

        {ordered.length === 0 && (
          <p className={styles.designEmpty}>
            {needle
              ? `Nothing matches “${query}”.`
              : `There's only one ${current?.category.toLowerCase() ?? "section"} design so far — nothing to switch to yet.`}
          </p>
        )}

        {!needle && otherCategory.length > 0 && (
          <button
            type="button"
            className={styles.designMore}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? `Show only ${current?.category.toLowerCase()} designs`
              : `Browse all ${fits.length} designs`}
          </button>
        )}
      </div>
    </section>
  );
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
