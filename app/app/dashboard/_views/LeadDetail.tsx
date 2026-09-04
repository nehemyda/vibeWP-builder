import Link from "next/link";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { LeadStatusPicker } from "./LeadStatus";
import { addLeadNoteAction } from "@/app/actions/leads";
import type { LeadStatus } from "@/lib/leads/status";

/**
 * One enquiry, in full.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY EVERY ANSWER, NOT A FIXED SET OF COLUMNS
 *
 * The list can only show a name and a summary; a form asking "which service?"
 * or "preferred date?" has answers that never appear there, so the list alone
 * loses the part that decides what to do about the lead. This renders whatever
 * the form actually collected, in the order it was collected.
 *
 * Context — page, referrer, time — sits below and quieter. It matters when
 * judging a lead and never when reading one.
 */

const CONTACT_KEYS = ["email", "phone", "tel", "mobile"];

/** A label for a stored key, since the field's own label is not saved per answer. */
function humanise(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function LeadDetail({
  data,
  meta,
  receivedAt,
  formName,
  backHref,
  smbId,
  submissionId,
  status,
  valuePounds,
  notes,
}: {
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
  receivedAt: string;
  formName: string | null;
  backHref: string;
  smbId: string;
  submissionId: string;
  status: LeadStatus;
  valuePounds: string;
  notes: { id: string; body: string; authorName: string | null; createdAt: Date }[];
}) {
  const entries = Object.entries(data).filter(([, v]) => String(v ?? "").trim() !== "");

  return (
    <div>
      <style>{`.yp-lead-contact:hover{text-decoration:underline;text-underline-offset:2px}`}</style>

      <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "1rem" }}>
        <Link className={shell.btn} href={backHref}>
          ← Submissions
        </Link>
        <span style={{ fontSize: "0.85rem", color: "var(--muted, #79808f)" }}>
          {receivedAt}
          {formName ? ` · ${formName}` : ""}
        </span>
      </div>

      <div className={shell.panel} style={{ padding: "1.1rem 1.3rem", maxWidth: "44rem", marginBottom: "1rem" }}>
        <LeadStatusPicker
          smbId={smbId}
          submissionId={submissionId}
          status={status}
          valuePounds={valuePounds}
        />
      </div>

      <div className={shell.panel} style={{ padding: "1.3rem", maxWidth: "44rem" }}>
        {entries.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted, #79808f)" }}>This enquiry was empty.</p>
        ) : (
          <dl style={{ margin: 0, display: "grid", gap: "1rem" }}>
            {entries.map(([key, value]) => {
              const text = String(value);
              const isContact = CONTACT_KEYS.includes(key.toLowerCase());
              const href = key.toLowerCase() === "email" ? `mailto:${text}` : `tel:${text.replace(/[^\d+]/g, "")}`;
              return (
                <div key={key}>
                  <dt
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--muted, #79808f)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {humanise(key)}
                  </dt>
                  {/* Contact answers are actionable, so they are links: replying is
                      the entire point of reading an enquiry. */}
                  <dd style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                    {isContact ? (
                      /*
                        Styled, not left to the browser. A default link puts a
                        blue underline through an email address, which reads as
                        decoration over the very thing being read — and these
                        sit in a list of answers where everything else is plain
                        text. Underlined on hover, so it still announces itself
                        as clickable when reached for.
                      */
                      <a
                        href={href}
                        style={{ color: "var(--primary, #f54900)", textDecoration: "none", fontWeight: 500 }}
                        className="yp-lead-contact"
                      >
                        {text}
                      </a>
                    ) : (
                      text
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>

      {/*
        What was done about it. Newest last, so the thread reads in the order it
        happened — a call log people scroll to the bottom of, not a feed.
      */}
      <div className={shell.panel} style={{ padding: "1.3rem", maxWidth: "44rem", marginTop: "1rem" }}>
        <h3 style={{ margin: "0 0 0.8rem", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted, #79808f)" }}>
          Notes
        </h3>

        {notes.length === 0 ? (
          <p style={{ margin: "0 0 0.9rem", fontSize: "0.88rem", color: "var(--muted, #79808f)" }}>
            Nothing yet. Record what you did, so the next call starts where this one ended.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: "0 0 1rem", padding: 0, display: "grid", gap: "0.8rem" }}>
            {notes.map((n) => (
              <li key={n.id} style={{ borderLeft: "2px solid var(--line, #e6e8ee)", paddingLeft: "0.8rem" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--muted, #79808f)", marginBottom: "0.15rem" }}>
                  {n.authorName ?? "Someone"} · {n.createdAt.toLocaleString()}
                </div>
                <div style={{ fontSize: "0.92rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.body}</div>
              </li>
            ))}
          </ul>
        )}

        <form action={addLeadNoteAction.bind(null, smbId, submissionId)} style={{ display: "grid", gap: "0.5rem" }}>
          <textarea
            name="body"
            rows={2}
            placeholder="Called, left voicemail…"
            style={{
              width: "100%", padding: "0.6rem 0.7rem", border: "1px solid var(--line, #e6e8ee)",
              borderRadius: 9, font: "inherit", fontSize: "0.9rem", resize: "vertical",
            }}
          />
          <button type="submit" className={shell.btn} style={{ justifySelf: "start" }}>
            Add note
          </button>
        </form>
      </div>

      <details style={{ marginTop: "1rem", maxWidth: "44rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.82rem", color: "var(--muted, #79808f)" }}>
          Where it came from
        </summary>
        <div className={shell.panel} style={{ padding: "1rem", marginTop: "0.6rem", fontSize: "0.82rem" }}>
          {(["page", "referrer", "userAgent", "ip"] as const).map((k) => (
            <div key={k} style={{ display: "flex", gap: "0.8rem", padding: "0.2rem 0" }}>
              <span style={{ color: "var(--muted, #79808f)", minWidth: "6rem" }}>{humanise(k)}</span>
              <span style={{ wordBreak: "break-all" }}>{String(meta[k] ?? "—")}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
