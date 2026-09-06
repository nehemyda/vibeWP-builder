"use client";

import { useState } from "react";
import { SECTION_PARTS, VISIBILITY, fieldFor } from "@/lib/design/part-visibility";
import styles from "./builder.module.css";

/**
 * The parts of one section: drag to reorder, choose where each shows, delete.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LIST COMES FROM WHAT RENDERED
 *
 * Not from a registry of which section owns an eyebrow. The markup is the
 * truth about what is there, and a second description of it would be free to
 * drift the first time a section changed — which is the same reason text and
 * photographs are found by looking at the page rather than by being declared.
 *
 * WHY DRAG AND ALSO ARROWS
 *
 * Dragging is what was asked for and is the faster way to move something two
 * places. It is also unusable with a keyboard, unreliable on a touchpad at
 * the edges of a scrolling list, and impossible to describe to a screen
 * reader. The arrows are the same operation, exact, and always available; the
 * section bar already made this call for moving whole sections.
 *
 * WHY HIDE AND DELETE LOOK DIFFERENT
 *
 * They are different, and the client said so plainly. Hiding is reversible
 * from this list and keeps the words; deleting takes them away, undoable only
 * for as long as the page is open. So hide is a quiet select and delete is a
 * destructive button that asks first.
 * ─────────────────────────────────────────────────────────────────────
 */
export function PartsPanel({
  parts,
  order,
  visibility,
  busy,
  onReorder,
  onSetVisibility,
  onDelete,
}: {
  /** Part keys present in the rendered section, in the order they appear. */
  parts: string[];
  order: string[];
  visibility: Record<string, string>;
  busy?: boolean;
  onReorder: (order: string[]) => void;
  onSetVisibility: (part: string, value: string) => void;
  onDelete: (part: string) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const labelOf = (key: string) => SECTION_PARTS.find((p) => p.key === key)?.label ?? key;

  const move = (key: string, by: -1 | 1) => {
    const from = order.indexOf(key);
    const to = from + by;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onReorder(next);
  };

  const drop = (onto: string) => {
    if (!dragging || dragging === onto) return;
    const next = order.filter((k) => k !== dragging);
    next.splice(next.indexOf(onto), 0, dragging);
    onReorder(next);
  };

  if (parts.length === 0) {
    return <p className={styles.partsEmpty}>This design has no separate parts to arrange.</p>;
  }

  return (
    <ul className={styles.partsList}>
      {order
        .filter((key) => parts.includes(key))
        .map((key) => {
          const shown = visibility[fieldFor(key)] ?? "all";
          return (
            <li
              key={key}
              className={[
                styles.partRow,
                dragging === key ? styles.partRowDragging : "",
                over === key ? styles.partRowOver : "",
                shown === "none" ? styles.partRowHidden : "",
              ]
                .filter(Boolean)
                .join(" ")}
              draggable={!busy}
              onDragStart={() => setDragging(key)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                // Without preventDefault the browser refuses the drop and the
                // whole list becomes a no-op that looks like it should work.
                e.preventDefault();
                setOver(key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(key);
                setDragging(null);
                setOver(null);
              }}
            >
              <span className={styles.partGrip} aria-hidden="true">
                ⠿
              </span>
              <span className={styles.partName}>{labelOf(key)}</span>

              <span className={styles.partNudge}>
                <button
                  type="button"
                  disabled={busy || order.indexOf(key) === 0}
                  onClick={() => move(key, -1)}
                  title={`Move ${labelOf(key)} up`}
                  aria-label={`Move ${labelOf(key)} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={busy || order.indexOf(key) === order.length - 1}
                  onClick={() => move(key, 1)}
                  title={`Move ${labelOf(key)} down`}
                  aria-label={`Move ${labelOf(key)} down`}
                >
                  ↓
                </button>
              </span>

              <select
                className={styles.partShow}
                value={shown}
                disabled={busy}
                title="Which screen sizes this shows on"
                aria-label={`Show ${labelOf(key)} on`}
                onChange={(e) => onSetVisibility(key, e.target.value)}
              >
                {VISIBILITY.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>

              {confirming === key ? (
                <span className={styles.partConfirm}>
                  <button
                    type="button"
                    className={styles.partConfirmYes}
                    disabled={busy}
                    onClick={() => {
                      setConfirming(null);
                      onDelete(key);
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.partDelete}
                  disabled={busy}
                  /*
                   * Asks first. Hiding is one click because it is reversible
                   * from this very list; deleting takes the words away, and
                   * is undoable only while the page stays open.
                   */
                  onClick={() => setConfirming(key)}
                  title={`Delete the ${labelOf(key).toLowerCase()}`}
                  aria-label={`Delete the ${labelOf(key).toLowerCase()}`}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
    </ul>
  );
}
