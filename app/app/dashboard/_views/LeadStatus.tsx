"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLeadStatusAction } from "@/app/actions/leads";
import { LEAD_STATUSES, STATUS_LABEL, STATUS_TONE, type LeadStatus } from "@/lib/leads/status";
import shell from "@/components/dashboard/dashboard-shell.module.css";

export function LeadStatusPicker({
  smbId,
  submissionId,
  status,
  valuePounds,
}: {
  smbId: string;
  submissionId: string;
  status: LeadStatus;
  valuePounds: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(valuePounds);

  function set(next: LeadStatus, v = value) {
    start(async () => {
      await setLeadStatusAction(smbId, submissionId, next, v);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {LEAD_STATUSES.map((s) => {
          const on = s === status;
          return (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => set(s)}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: 999,
                border: `1px solid ${on ? STATUS_TONE[s].fg : "var(--line, #e6e8ee)"}`,
                background: on ? STATUS_TONE[s].bg : "transparent",
                color: on ? STATUS_TONE[s].fg : "var(--muted, #79808f)",
                font: "inherit",
                fontSize: "0.82rem",
                fontWeight: on ? 700 : 500,
                cursor: pending ? "default" : "pointer",
              }}
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>

      {/*
        Only on a won lead. A value box on every status invites a figure being
        typed against an enquiry that never closed, which would quietly inflate
        any total built from these.
      */}
      {status === "won" && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <label style={{ fontSize: "0.82rem", color: "var(--muted, #79808f)" }} htmlFor="leadValue">
            Worth
          </label>
          <input
            id="leadValue"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => set("won")}
            placeholder="0.00"
            style={{
              width: "8rem",
              padding: "0.4rem 0.6rem",
              border: "1px solid var(--line, #e6e8ee)",
              borderRadius: 8,
              font: "inherit",
              fontSize: "0.88rem",
            }}
          />
          <span style={{ fontSize: "0.78rem", color: "var(--muted, #79808f)" }}>
            {pending ? "Saving…" : "saved when you click away"}
          </span>
        </div>
      )}
    </div>
  );
}

/** The same badge, read-only, for the list. */
export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const t = STATUS_TONE[status] ?? STATUS_TONE.new;
  return (
    <span
      style={{
        padding: "0.15rem 0.5rem",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontSize: "0.72rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
