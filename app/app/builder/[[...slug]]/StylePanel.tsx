"use client";

import { DESIGN_TOKENS, TOKEN_GROUPS, type DesignTokens } from "@/lib/design/tokens";
import { ELEMENT_ROLES } from "@/lib/design/element-style";
import type { FieldSpec } from "@/lib/sections/types";
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
/**
 * One section setting.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A COMPONENT AND NOT TWO COPIES
 *
 * The element options and the section options rendered the same control,
 * written out twice. Both drew a <select> filled from `spec.choices` — which
 * meant a `number` field, having no choices, drew an EMPTY dropdown in both
 * places. The type was declared in FieldType and routed by isOptionField, and
 * min/max already sat on FieldSpec marked "Only for `number`", so the contract
 * promised something neither call site delivered.
 *
 * Nothing used it until embed-block needed a height, which is why an empty
 * control shipped twice over rather than once.
 * ─────────────────────────────────────────────────────────────────────
 */
function OptionControl({
  id,
  spec,
  value,
  busy,
  onChange,
}: {
  id: string;
  spec: FieldSpec;
  value: string;
  busy?: boolean;
  onChange: (value: string) => void;
}) {
  if (spec.type === "number") {
    return (
      <input
        id={id}
        type="number"
        className={styles.styleSelect}
        value={value}
        min={spec.min}
        max={spec.max}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <select
      id={id}
      className={styles.styleSelect}
      value={value}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
    >
      {(spec.choices ?? []).map((choice) => (
        <option key={choice} value={choice}>
          {/*
            A choice is stored as a key and shown to a client. For "none" or
            "tint" those are the same word, so every section so far has read
            correctly by accident. A provider key does not: "sociablekit" is
            not how SociableKIT spells itself, and the panel capitalises, so it
            would reach a client as "Sociablekit".
          */}
          {spec.choiceLabels?.[choice] ?? choice}
        </option>
      ))}
    </select>
  );
}

export function StylePanel({
  tokens,
  onPreview,
  onCommit,
  onClose,
  busy,
  bare,
  scope,
  section,
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
  /**
   * A section's own settings, when one is selected.
   *
   * Present means the panel is showing THAT section rather than the whole
   * site, and the site-wide sliders step aside — two sets of controls that
   * both say "heading size" on one screen is a question about which one wins,
   * and the answer would have to be explained rather than seen.
   */
  /**
   * Rendered without its own frame, for use inside the site dashboard.
   *
   * The controls are identical; only the container differs. Duplicating them
   * would mean two places to change a slider's range.
   */
  bare?: boolean;
  section?: {
    name: string;
    values: Record<string, string>;
    onChange: (field: string, value: string) => void;
    /** The element inside it that was clicked, if any. */
    role?: string;
    /** Back up to the whole section from the breadcrumb. */
    onClearRole?: () => void;
    /*
     * Every option this section actually has: the shared ones every section
     * gets (heading size, space around it) followed by whatever THIS
     * section declares for itself (a hero's background, a gallery's photos
     * per row). Assembled by the caller — sectionOwnOptions() plus
     * SECTION_STYLE_OPTIONS — rather than imported here, so this component
     * never needs to know which registry entry is selected.
     */
    options: Array<{ field: string; spec: FieldSpec }>;
  };
}) {
  const set = (name: string, value: number) => ({ ...tokens, [name]: value });
  const dirty = DESIGN_TOKENS.some((t) => tokens[t.name] !== undefined && tokens[t.name] !== t.unset);

  /* Declared once; the dashboard renders it bare and the panel frames it. */
  const body = (
  <div className={styles.styleBody}>
    {section?.role ? (
      <section className={styles.styleGroup}>
        <h3 className={styles.styleGroupName}>
          {ELEMENT_ROLES.find((r) => r.key === section.role)?.label}
        </h3>
        {(ELEMENT_ROLES.find((r) => r.key === section.role)?.options ?? []).map((option) => {
          const value = section.values[option.field] ?? String(option.spec.default ?? "default");
          return (
            <div key={option.field} className={styles.styleRow}>
              <label className={styles.styleLabel} htmlFor={`el-${option.field}`}>
                <span>{option.spec.label}</span>
              </label>
              <OptionControl
                id={`el-${option.field}`}
                spec={option.spec}
                value={value}
                busy={busy}
                onChange={(v) => section.onChange(option.field, v)}
              />
            </div>
          );
        })}
      </section>
    ) : section ? (
      <section className={styles.styleGroup}>
        <h3 className={styles.styleGroupName}>This section</h3>
        {section.options.map((option) => {
          const value = section.values[option.field] ?? String(option.spec.default ?? "default");
          return (
            <div key={option.field} className={styles.styleRow}>
              <label className={styles.styleLabel} htmlFor={`sec-${option.field}`}>
                <span>{option.spec.label}</span>
              </label>
              <OptionControl
                id={`sec-${option.field}`}
                spec={option.spec}
                value={value}
                busy={busy}
                onChange={(v) => section.onChange(option.field, v)}
              />
              {option.spec.hint && <p className={styles.styleHint}>{option.spec.hint}</p>}
            </div>
          );
        })}
      </section>
    ) : (
      TOKEN_GROUPS.map((group) => (
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
      ))
    )}
  </div>
  );

  /*
   * Inside the dashboard the frame and the header are the dashboard's, so
   * only the body is rendered. Everything below is shared verbatim.
   */
  if (bare) {
    return <div className={styles.styleBodyBare}>{body}</div>;
  }

  return (
    <aside className={styles.stylePanel} aria-label="Style">
      <header className={styles.styleHeader}>
        <div>
          <strong className={styles.styleTitle}>Style</strong>
          {/*
            A breadcrumb once an element is selected, so the reach of these
            controls is readable and the way back up is the same control that
            says where you are.
          */}
          {section?.role ? (
            <span className={styles.styleScope}>
              <button type="button" className={styles.styleCrumb} onClick={section.onClearRole}>
                {section.name}
              </button>
              {" › "}
              {ELEMENT_ROLES.find((r) => r.key === section.role)?.label ?? section.role}
            </span>
          ) : (
            <span className={styles.styleScope}>{section ? section.name : scope}</span>
          )}
        </div>
        <button type="button" className={styles.designClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      {body}

      <footer className={styles.styleFooter}>
        {section ? (
          <button
            type="button"
            className={styles.styleReset}
            disabled={busy}
            onClick={() => {
              // Every option shown, not just the shared ones — a client who
              // asks to "reset this section" means everything on the panel,
              // background and width included.
              for (const option of section.options) {
                section.onChange(option.field, String(option.spec.default ?? "default"));
              }
            }}
          >
            Reset this section
          </button>
        ) : (
          <button
            type="button"
            className={styles.styleReset}
            disabled={busy || !dirty}
            onClick={() => onCommit({})}
          >
            {dirty ? "Back to the original design" : "Matching the original design"}
          </button>
        )}
      </footer>
    </aside>
  );
}
