"use client";

import { useEffect, useRef, type FormEvent } from "react";
import styles from "./builder.module.css";

/**
 * The chat composer: one bordered box holding the field and its controls.
 *
 * Extracted from BuilderApp so it can be looked at without a logged-in
 * session — the builder is behind auth, and a copy of this markup in a test
 * harness would drift from the real thing within a week.
 */
export function Composer({
  draft,
  onDraft,
  onSubmit,
  busy,
  scope,
}: {
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  /** A change is in flight: the field locks and the button shows a spinner. */
  busy?: boolean;
  /** The page this instruction will change. */
  scope: string;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const ready = draft.trim().length > 0 && !busy;

  /*
   * Growing the field, where the browser will not do it for us.
   *
   * `field-sizing: content` handles this natively and is what the stylesheet
   * asks for, but only Chromium ships it — in Safari and Firefox the field
   * would silently stay one line tall, which is the exact problem switching
   * away from an <input> was meant to solve. So the measurement runs only when
   * the native property is missing, rather than fighting it where it works.
   */
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    if (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <div className={styles.chatInput}>
      <form className={styles.composer} onSubmit={onSubmit}>
        {/*
          A TEXTAREA, not an input. A single-line field showed the last forty
          characters of a long instruction, so the client could not read back
          what they were about to send.
        */}
        <textarea
          ref={field}
          className={styles.composerField}
          value={draft}
          rows={1}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter starts a line — the convention
            // everywhere else, and it only works because the field grows.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (ready) onSubmit(e);
            }
          }}
          placeholder="Describe a change to your site…"
          disabled={busy}
        />

        <div className={styles.composerBar}>
          {/*
            Which page this will change. The page switcher lives up in the
            toolbar, far from the field, so an instruction typed here gave no
            clue what it would act on — and "add a gallery" means something
            different on Home than on Contact.
          */}
          <span className={styles.composerScope}>
            Editing <strong>{scope}</strong>
          </span>

          {/*
            A SPINNER, not a stop square. Nothing here can abort a change once
            it has been sent — the server is already writing to the page — so a
            stop button would be a promise we cannot keep.
          */}
          <button
            type="submit"
            className={styles.composerSend}
            disabled={!ready}
            aria-label={busy ? "Working" : "Send"}
            title={busy ? "Working…" : "Send"}
          >
            {busy ? <span className={styles.composerSpinner} /> : "↑"}
          </button>
        </div>
      </form>
      <p className={styles.composerNote}>
        VibeWP can get things wrong — look over the page before you publish.
      </p>
    </div>
  );
}

/**
 * A cover over the workspace while a canvas change is in flight.
 *
 * Two jobs. It says what is happening, because a swap that has to write new
 * copy takes about five seconds and a page that simply sits there for five
 * seconds after a click reads as a click that did not land. And it stops a
 * second click landing on a page that is about to be replaced underneath it:
 * pressing another design mid-swap would send an operation built from a schema
 * that no longer matches the one on screen.
 */
export function WorkingCover({ label }: { label: string }) {
  return (
    <div className={styles.canvasCover} role="status" aria-live="polite">
      <div className={styles.canvasCoverCard}>
        <span className={styles.canvasCoverSpinner} />
        <span>{label}…</span>
      </div>
    </div>
  );
}
