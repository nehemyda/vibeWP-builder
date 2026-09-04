"use client";

import { DESIGN_TOKENS, TOKEN_GROUPS, type DesignTokens } from "@/lib/design/tokens";
import styles from "./builder.module.css";

/**
 * Styling the site by hand, rather than by asking for it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A LEFT SIDEBAR, AND CHAT STEPS ASIDE FOR IT
 *
 * Chat is the wrong instrument for design. Nudging a heading a little smaller
 * by sentence is slow, imprecise and unrepeatable, and you cannot feel your
 * way to a proportion through a language model. So these are controls you
 * drag, and the canvas moves under your hand.
 *
 * Every control is BOUNDED and every one has an explicit "same as the design"
 * position. A client cannot reach a page we have not effectively seen, and can
 * always get back to the one we shipped. That is what makes it safe to hand
 * over: the range, not a warning.
 *
 * `onPreview` fires while dragging and `onCommit` on release — the same split
 * the form style editor already uses, and the reason this feels immediate
 * rather than laggy.
 * ─────────────────────────────────────────────────────────────────────
 */
export function StylePanel({
  tokens,
  onPreview,
  onCommit,
  onClose,
  busy,
  scope,
}: {
  tokens: DesignTokens;
  /** Live, unsaved — fires continuously while a slider moves. */
  onPreview: (tokens: DesignTokens) => void;
  /** Persisted, on release. */
  onCommit: (tokens: DesignTokens) => void;
  onClose: () => void;
  busy?: boolean;
  /** What these controls apply to, shown so the reach is never a guess. */
  scope: string;
}) {
  const set = (name: string, value: number) => ({ ...tokens, [name]: value });
  const dirty = DESIGN_TOKENS.some((t) => tokens[t.name] !== undefined && tokens[t.name] !== t.unset);

  return (
    <aside className={styles.stylePanel} aria-label="Style this site">
      <header className={styles.styleHeader}>
        <div>
          <strong className={styles.styleTitle}>Style</strong>
          <span className={styles.styleScope}>{scope}</span>
        </div>
        <button type="button" className={styles.designClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className={styles.styleBody}>
        {TOKEN_GROUPS.map((group) => (
          <section key={group} className={styles.styleGroup}>
            <h3 className={styles.styleGroupName}>{group}</h3>
            {DESIGN_TOKENS.filter((t) => t.group === group).map((spec) => {
              const value = tokens[spec.name] ?? spec.unset;
              const atDefault = value === spec.unset;
              return (
                <div key={spec.name} className={styles.styleRow}>
                  <label className={styles.styleLabel} htmlFor={`tok-${spec.name}`}>
                    <span>{spec.label}</span>
                    <output className={atDefault ? styles.styleValueMuted : styles.styleValue}>
                      {spec.kind === "px" ? `${value}px` : `${Math.round(value * 100)}%`}
                    </output>
                  </label>
                  <input
                    id={`tok-${spec.name}`}
                    type="range"
                    className={styles.styleRange}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    value={value}
                    disabled={busy}
                    // Continuously while dragging, so the canvas tracks the thumb.
                    onChange={(e) => onPreview(set(spec.name, Number(e.target.value)))}
                    // On release — pointer, keyboard and touch all end here.
                    onPointerUp={(e) => onCommit(set(spec.name, Number((e.target as HTMLInputElement).value)))}
                    onKeyUp={(e) => onCommit(set(spec.name, Number((e.target as HTMLInputElement).value)))}
                  />
                  {spec.hint && <p className={styles.styleHint}>{spec.hint}</p>}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <footer className={styles.styleFooter}>
        <button
          type="button"
          className={styles.styleReset}
          disabled={busy || !dirty}
          onClick={() => onCommit({})}
        >
          {dirty ? "Back to the original design" : "Matching the original design"}
        </button>
      </footer>
    </aside>
  );
}
