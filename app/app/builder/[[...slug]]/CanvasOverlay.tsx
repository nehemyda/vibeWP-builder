"use client";

import { useEffect, useRef, useState } from "react";
import type { CanvasSelection, SectionBox } from "./PreviewFrame";
import type { Clip } from "@/lib/design/clipboard";
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
  onEdit,
  editing,
  onMove,
  onRemove,
  onDuplicate,
  onCopy,
  onPaste,
  getClip,
}: {
  boxes: SectionBox[];
  selection: CanvasSelection | null;
  /** The section's name, from the registry. */
  labelFor: (selection: CanvasSelection) => string;
  /** An edit is in flight, so the controls must not fire twice. */
  busy?: boolean;
  onChangeDesign: (selection: CanvasSelection) => void;
  /**
   * Enters edit mode on this section: its text becomes typeable and the
   * sidebar opens on its settings. A toggle — pressing it again leaves.
   */
  onEdit?: (selection: CanvasSelection) => void;
  /** Whether THIS section is the one being edited, for the pressed state. */
  editing?: boolean;
  onMove: (selection: CanvasSelection, direction: -1 | 1) => void;
  onRemove: (selection: CanvasSelection) => void;
  /** Duplicate / copy / paste, in the overflow menu. */
  onDuplicate?: (selection: CanvasSelection) => void;
  onCopy?: (selection: CanvasSelection, what: "section" | "style") => void;
  onPaste?: (selection: CanvasSelection, what: "section" | "style") => void;
  /** Reads the clipboard, called when the menu opens. */
  getClip?: () => Clip | null;
}) {
  /*
   * The menu remembers WHICH selection it was opened for, rather than merely
   * that it is open. The bar moves to whichever section is selected, so an
   * open menu would otherwise travel with it and offer actions for a section
   * the client has already left. Derived, not synchronised — there is no
   * effect that can be out of step with the selection.
   */
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  /*
   * Which way the menu opens.
   *
   * A section near the bottom of the window put its menu below the fold —
   * Paste, the item most likely to be wanted, was the one off-screen. Measured
   * from the button rather than guessed from the section's position, because
   * the canvas scrolls independently of the page.
   */
  const [dropUp, setDropUp] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectionId = selection ? JSON.stringify(selection) : "";
  const menuOpen = openFor !== null && openFor === selectionId;
  const setMenuOpen = (open: boolean) => setOpenFor(open ? selectionId : null);
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpenFor(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpenFor(null);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

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
            Edit sits beside Change design because they are the two halves of
            the same question — a different layout, or this one worked on.
            Chrome is excluded: a header's spacing is not a page section's
            spacing, and its settings live on the site rather than the page.

            It is a MODE, not a panel button, which is why it shows a pressed
            state. Selecting a section used to make all of its text typeable
            straight away, so every click landed a caret somewhere and there
            was no way to simply point at a section. Now nothing is editable
            until this is on.
          */}
          {!isChrome && onEdit && (
            <button
              type="button"
              className={`${styles.selectionSecondary} ${editing ? styles.selectionSecondaryOn : ""}`}
              disabled={busy}
              aria-pressed={!!editing}
              title={editing ? "Stop editing this section" : "Edit this section's text and settings"}
              onClick={() => onEdit(selection)}
            >
              {editing ? "Done" : "Edit"}
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
              {(onDuplicate || onCopy || onPaste) && (
                <div className={styles.selectionMenuWrap} ref={menuRef}>
                  <button
                    type="button"
                    className={styles.selectionIcon}
                    disabled={busy}
                    title="More"
                    aria-label="More actions"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={(e) => {
                      if (menuOpen) return setMenuOpen(false);
                      /*
                       * Read when the menu opens, not held in state. The
                       * clipboard lives in sessionStorage and can have been
                       * written on a different page of this same tab, so
                       * anything cached here would go stale silently.
                       */
                      setClip(getClip?.() ?? null);
                      const below = window.innerHeight - e.currentTarget.getBoundingClientRect().bottom;
                      // The tallest the menu gets: four items plus its rule.
                      setDropUp(below < 190);
                      setMenuOpen(true);
                    }}
                  >
                    ⋯
                  </button>
                  {menuOpen && (
                    <div
                      className={`${styles.selectionMenu} ${dropUp ? styles.selectionMenuUp : ""}`}
                      role="menu"
                    >
                      {onDuplicate && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            onDuplicate(selection);
                          }}
                        >
                          Duplicate section
                        </button>
                      )}
                      {onCopy && (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false);
                              onCopy(selection, "section");
                            }}
                          >
                            Copy section
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false);
                              onCopy(selection, "style");
                            }}
                          >
                            Copy style
                          </button>
                        </>
                      )}
                      {/*
                        Paste names what is on the clipboard. "Paste" alone is
                        a guess about what will happen; "Paste Services grid"
                        is not — and the clipboard survives moving between
                        pages, so by the time it is used the client may well
                        have forgotten what they took.
                      */}
                      {onPaste && clip && (
                        <>
                          <span className={styles.selectionMenuRule} />
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false);
                              onPaste(selection, clip.kind);
                            }}
                          >
                            {clip.kind === "style"
                              ? `Paste style from ${clip.label}`
                              : `Paste ${clip.label} below`}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
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
