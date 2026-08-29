"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFormAction, deleteFormAction, setFormActiveAction } from "@/app/actions/forms";
import shell from "@/components/dashboard/dashboard-shell.module.css";

export type FormRow = {
  id: string;
  name: string;
  fieldCount: number;
  embedToken: string | null;
  isActive: boolean;
  submissionCount: number;
};

/**
 * The list of embeddable forms, and the one button that creates them.
 *
 * A client component because creating is an action and the snippet needs a
 * copy button; the surrounding page stays a server component so the list
 * itself is rendered from the database, not fetched after paint.
 */
export function FormsTab({
  smbId,
  forms,
  leadsPath,
}: {
  smbId: string;
  forms: FormRow[];
  /** Base URL for the editor, e.g. /dashboard/PID/SMB/leads */
  leadsPath: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  function snippetFor(token: string) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `<div data-vibewp-form="${token}"></div>\n<script src="${origin}/embed.js" async></script>`;
  }

  return (
    <div className={shell.panel} style={{ padding: "1.3rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: forms.length ? "1.1rem" : 0,
        }}
      >
        <p style={{ margin: 0, color: "var(--ink-2, #4a5160)", fontSize: "0.9rem" }}>
          Build a form, paste one snippet anywhere, and enquiries arrive here.
        </p>
        <button
          type="button"
          className={`${shell.btn} ${shell.btnPrimary}`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await createFormAction(smbId);
              // Straight into the editor: a new form exists to be shaped.
              if (res.ok) router.push(`${leadsPath}?tab=forms&form=${res.id}`);
            })
          }
        >
          {pending ? "Creating…" : "New form"}
        </button>
      </div>

      {forms.length === 0 ? (
        <p style={{ margin: "1.4rem 0 0.2rem", color: "var(--muted, #79808f)", fontSize: "0.9rem" }}>
          No forms yet. A new form starts with name, email, phone and message — change
          or remove any of them.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.7rem" }}>
          {forms.map((f) => (
            <li
              key={f.id}
              style={{
                border: "1px solid var(--line, #e6e8ee)",
                borderRadius: 12,
                padding: "0.9rem 1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{f.name}</span>
                {!f.isActive && (
                  <span style={{ fontSize: "0.72rem", color: "var(--muted, #79808f)" }}>Paused</span>
                )}
                <span style={{ marginLeft: "auto", fontSize: "0.82rem", color: "var(--muted, #79808f)" }}>
                  {f.fieldCount} fields · {f.submissionCount}{" "}
                  {f.submissionCount === 1 ? "submission" : "submissions"}
                </span>

                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <a className={shell.btn} href={`${leadsPath}?tab=forms&form=${f.id}`}>
                    Edit
                  </a>
                  <button
                    type="button"
                    className={shell.btn}
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await setFormActiveAction(smbId, f.id, !f.isActive);
                        router.refresh();
                      })
                    }
                    title={
                      f.isActive
                        ? "Stop accepting submissions, keeping the form and its leads"
                        : "Start accepting submissions again"
                    }
                  >
                    {f.isActive ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className={shell.btn}
                    disabled={pending}
                    onClick={() => {
                      /*
                       * Confirmed, and the confirmation says what survives.
                       *
                       * "Are you sure?" makes someone guess whether their
                       * enquiries go too. Naming the count answers the only
                       * question they actually have.
                       */
                      const kept =
                        f.submissionCount > 0
                          ? ` Its ${f.submissionCount} ${
                              f.submissionCount === 1 ? "submission stays" : "submissions stay"
                            } in your list.`
                          : "";
                      if (!window.confirm(`Delete "${f.name}"?${kept} The embed snippet will stop working.`)) return;
                      start(async () => {
                        await deleteFormAction(smbId, f.id);
                        router.refresh();
                      });
                    }}
                    style={{ color: "#b3261e" }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {f.embedToken && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.7rem", opacity: f.isActive ? 1 : 0.5 }}>
                  {/* Read-only rather than plain text: it stays selectable and
                      keyboard-copyable if the clipboard API is unavailable.
                      Dimmed when paused, because a snippet that renders nothing
                      should not look ready to paste. */}
                  <input
                    readOnly
                    value={snippetFor(f.embedToken).replace("\n", " ")}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "0.45rem 0.6rem",
                      border: "1px solid var(--line, #e6e8ee)",
                      borderRadius: 8,
                      background: "var(--bg, #f7f8fa)",
                      font: "inherit",
                      fontSize: "0.76rem",
                      fontFamily: "ui-monospace, monospace",
                      color: "var(--ink-2, #4a5160)",
                    }}
                  />
                  <button
                    type="button"
                    className={shell.btn}
                    onClick={() => {
                      void navigator.clipboard.writeText(snippetFor(f.embedToken!));
                      setCopied(f.id);
                      setTimeout(() => setCopied(null), 1500);
                    }}
                  >
                    {copied === f.id ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
