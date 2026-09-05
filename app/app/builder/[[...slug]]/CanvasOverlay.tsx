"use client";

import type { CanvasSelection, SectionBox } from "./PreviewFrame";
import { sameSelection } from "./PreviewFrame";
import styles from "./builder.module.css";

/**
 * The builder's own controls, drawn OVER the canvas rather than inside it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY NOT IN THE PREVIEW DOCUMENT
 *
 * The preview iframe holds exactly the markup we export, and its height is
 * measured from its own content. A toolbar injected into it would appear in a
 * client's WordPress content and count towards the frame's height. So the
 * frame reports where each section IS, and this positions against that.
 *
 * That mapping is a plain offset, which is why it can be this simple: the
 * viewport toggle only constrains max-width (it does not scale), and the frame
 * never scrolls itself — the panel around it does. If either changes, the
 * rects need the scale factor and the scroll offset folded in.
 *
 * The previous attempt at a selection UI was deleted because its badge put the
 * section's name in CSS `content`, so it read the literal string "HeroSplit".
 * The name comes from the registry here, through `labelFor`.
 * ─────────────────────────────────────────────────────────────────────
 */
export function CanvasOverlay({
  boxes,
  selection,
  labelFor,
  busy,
  onChangeDesign,
  onStyle,
  onMove,
  onRemove,
}: {
  boxes: SectionBox[];
  selection: CanvasSelection | null;
  /** The section's name, from the registry. */
  labelFor: (selection: CanvasSelection) => string;
  /** An edit is in flight, so the controls must not fire twice. */
  busy?: boolean;
  onChangeDesign: (selection: CanvasSelection) => void;
  /** Opens the style sidebar scoped to this section. */
  onStyle?: (selection: CanvasSelection) => void;
  onMove: (selection: CanvasSelection, direction: -1 | 1) => void;
  onRemove: (selection: CanvasSelection) => void;
}) {
  const box = boxes.find((b) => sameSelection(b.selection, selection));
  if (!selection || !box) return null;

  const nodeBoxes = boxes.filter((b) => b.selection.kind === "node");
  const at = nodeBoxes.findIndex((b) => sameSelection(b.selection, selection));

  /*
   * Header and footer are not page sections: they are template parts shared by
   * every page, so there is nothing to reorder them against and removing one
   * would strip it from the whole site. Only the design change applies, and it
   * routes to swap_chrome.
   */
  const isChrome = selection.kind === "chrome";

  /*
   * Where the controls go, which depends on how tall the section is.
   *
   * Inside the top edge by default, because .canvasFrame clips its overflow —
   * anything drawn above the first section is simply not painted.
   *
   * But a header is fifty pixels tall, and a toolbar inside it sat squarely on
   * top of the header's own "Book now" button: the client cannot see the thing
   * they are about to restyle. Short sections get their controls below
   * instead, unless there is nothing below to put them over.
   */
  const pageBottom = boxes.reduce((low, b) => Math.max(low, b.top + b.height), 0);
  const isShort = box.height < 76;
  const roomBelow = box.top + box.height + 44 <= pageBottom;
  const barsBelow = isShort && roomBelow;
  const barTop = barsBelow ? box.height + 6 : 6;

  return (
    <div className={styles.overlay} aria-hidden={false}>
      <div
        className={styles.selectionBox}
        style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      >
        <span
          className={styles.selectionLabel}
          style={barsBelow ? { top: box.height + 6, borderRadius: "6px 6px 0 0" } : undefined}
        >
          {labelFor(selection)}
        </span>

        <div className={styles.selectionTools} style={{ top: barTop }}>
          <button
            type="button"
            className={styles.selectionPrimary}
            disabled={busy}
            onClick={() => onChangeDesign(selection)}
          >
            Change design
          </button>
          {/*
            Style sits beside Change design because they are the two halves of
            the same question — a different layout, or this one adjusted.
            Chrome is excluded: a header's spacing is not a page section's
            spacing, and its settings live on the site rather than the page.
          */}
          {!isChrome && onStyle && (
            <button
              type="button"
              className={styles.selectionSecondary}
              disabled={busy}
              onClick={() => onStyle(selection)}
            >
              Style
            </button>
          )}
          {!isChrome && (
            <>
              {/*
                Up and down are here as well as being the keyboard path for
                dragging. They are the same move_section operation, they work
                without a pointer, and they are exact — a drag across a
                2,000-pixel page is neither.
              */}
              <button
                type="button"
                className={styles.selectionIcon}
                disabled={busy || at <= 0}
                title="Move up"
                aria-label="Move up"
                onClick={() => onMove(selection, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.selectionIcon}
                disabled={busy || at < 0 || at >= nodeBoxes.length - 1}
                title="Move down"
                aria-label="Move down"
                onClick={() => onMove(selection, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={`${styles.selectionIcon} ${styles.selectionDanger}`}
                disabled={busy}
                title="Remove this section"
                aria-label="Remove this section"
                onClick={() => onRemove(selection)}
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
