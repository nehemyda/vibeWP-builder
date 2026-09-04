"use client";

import { useState, useTransition } from "react";
import shell from "./dashboard-shell.module.css";

/**
 * Sends a test using whatever is currently typed in the form.
 *
 * Reads the values from the form element rather than holding its own copy of
 * every field: the form is the state, and a second copy would be one more thing
 * that can disagree with what the person is looking at.
 */
export function SmtpTestButton({
  action,
  defaultTo,
}: {
  action: (formData: FormData) => Promise<{ ok: true; to: string } | { ok: false; error: string }>;
  defaultTo: string;
}) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [to, setTo] = useState(defaultTo);
  const [pending, start] = useTransition();

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="you@example.com"
          aria-label="Send the test to"
          style={{
            flex: "1 1 14rem",
            minWidth: 0,
            padding: "0.55rem 0.7rem",
            border: "1px solid var(--line, #e6e8ee)",
            borderRadius: 9,
            font: "inherit",
            fontSize: "0.9rem",
          }}
        />
        <button
          type="button"
          className={shell.btn}
          disabled={pending}
          onClick={(e) => {
            const form = e.currentTarget.closest("form");
            if (!form) return;
            const data = new FormData(form);
            data.set("testTo", to);
            setResult(null);
            start(async () => {
              const r = await action(data);
              setResult(
                r.ok
                  ? { ok: true, text: `Sent to ${r.to}. If it doesn't arrive, check the spam folder.` }
                  : { ok: false, text: r.error },
              );
            });
          }}
        >
          {pending ? "Sending…" : "Send test email"}
        </button>
      </div>

      {result && (
        /*
          The server's own explanation, not a generic failure. "Could not send"
          is what made a test button necessary; a wrong password and a wrong
          hostname need different fixes and so get different sentences.
        */
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: "0.83rem",
            lineHeight: 1.5,
            color: result.ok ? "var(--ink-2, #4a5160)" : "#b3261e",
          }}
        >
          {result.text}
        </p>
      )}
    </div>
  );
}
