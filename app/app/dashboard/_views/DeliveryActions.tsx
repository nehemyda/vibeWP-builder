"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  downgradeSiteToVibeAction,
  upgradeSiteToWordPressAction,
  type DowngradePreflight,
} from "@/app/actions/site-lifecycle";
import shell from "@/components/dashboard/dashboard-shell.module.css";

type PlanChoice = { key: string; name: string; price: string };

/**
 * The two directions a site can move, and what each one costs.
 *
 * A client component because moving a site is not a form post that reloads a
 * page — it provisions a WordPress, or it fetches a site's photographs back
 * out of one. Both take seconds, both can refuse with something worth reading,
 * and a full navigation would throw that away.
 *
 * Nothing here decides whether a move is safe. The action refuses, and this
 * shows what it said — so the rule lives in one place and the UI cannot
 * drift into permitting something the server would not.
 */
export function DeliveryActions({
  smbId,
  mode,
  settingsPath,
  upgradePlans,
  downgradePlans,
  preflight,
}: {
  smbId: string;
  mode: string;
  settingsPath: string;
  upgradePlans: PlanChoice[];
  downgradePlans: PlanChoice[];
  preflight: DowngradePreflight | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const choices = mode === "wordpress" ? downgradePlans : upgradePlans;
  const [planKey, setPlanKey] = useState(choices[0]?.key ?? "");

  /* Ticked only when the preflight says something would actually be lost, so
     it cannot become a box people learn to tick by habit. */
  const losing = preflight?.losing ?? [];
  const blocking = preflight?.blocking ?? [];
  const [acceptLoss, setAcceptLoss] = useState(false);

  function run() {
    setMessage(null);
    setFailed(false);
    start(async () => {
      const result =
        mode === "wordpress"
          ? await downgradeSiteToVibeAction(smbId, planKey, acceptLoss)
          : await upgradeSiteToWordPressAction(smbId, planKey);

      if (result.ok) {
        setMessage(
          mode === "wordpress"
            ? `Moved to Vibe hosting. Your site is at ${result.url}`
            : `Your WordPress is ready at ${result.url}`,
        );
        router.refresh();
      } else {
        setFailed(true);
        setMessage(result.error);
      }
    });
  }

  if (choices.length === 0) {
    return (
      <p className={shell.rowSub}>
        {mode === "wordpress"
          ? "No plan without WordPress is available to move to."
          : "No plan currently includes WordPress."}
      </p>
    );
  }

  return (
    <div style={{ marginTop: "1.2rem", borderTop: "1px solid var(--line)", paddingTop: "1.2rem" }}>
      <h3 style={{ margin: "0 0 0.6rem", fontSize: "0.95rem" }}>
        {mode === "wordpress" ? "Move to Vibe hosting" : "Upgrade to Vibe WordPress"}
      </h3>

      {mode === "wordpress" && blocking.length > 0 && (
        <div className={shell.panel} style={{ padding: "0.9rem", marginBottom: "0.9rem" }}>
          <strong style={{ fontSize: "0.9rem" }}>WordPress holds newer edits</strong>
          <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
            {blocking.map((p) => (
              <li key={p.slug} className={shell.rowSub}>
                {p.title || p.slug} — {p.description}
              </li>
            ))}
          </ul>
          <p className={shell.rowSub} style={{ margin: "0.6rem 0 0" }}>
            Pull those in from the builder first. They exist nowhere else.
          </p>
        </div>
      )}

      {mode === "wordpress" && losing.length > 0 && (
        <div className={shell.panel} style={{ padding: "0.9rem", marginBottom: "0.9rem" }}>
          <strong style={{ fontSize: "0.9rem" }}>These would not come across</strong>
          <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
            {losing.map((p) => (
              <li key={p.slug} className={shell.rowSub}>
                {p.slug}: {p.blocks.join(", ")}
              </li>
            ))}
          </ul>
          <label
            style={{ display: "flex", gap: "0.45rem", alignItems: "center", marginTop: "0.7rem", fontSize: "0.85rem" }}
          >
            <input
              type="checkbox"
              checked={acceptLoss}
              onChange={(e) => setAcceptLoss(e.target.checked)}
            />
            Move anyway, without them
          </label>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={planKey}
          onChange={(e) => setPlanKey(e.target.value)}
          style={{ padding: "0.6rem 0.8rem", borderRadius: 10, border: "1px solid var(--line)", fontSize: "0.9rem" }}
        >
          {choices.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} — {p.price}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`${shell.btn} ${shell.btnPrimary}`}
          onClick={run}
          disabled={pending || blocking.length > 0 || (losing.length > 0 && !acceptLoss)}
        >
          {pending
            ? mode === "wordpress"
              ? "Moving…"
              : "Installing…"
            : mode === "wordpress"
              ? "Move to Vibe"
              : "Upgrade"}
        </button>
      </div>

      {message && (
        <p
          className={shell.rowSub}
          style={{ marginTop: "0.8rem", color: failed ? "#b3261e" : "var(--good)" }}
        >
          {message}
        </p>
      )}

      <p className={shell.rowSub} style={{ marginTop: "0.8rem" }}>
        {mode === "wordpress"
          ? "Your WordPress install is kept, not deleted. It simply stops being served."
          : "Your pages, forms and leads come with you — nothing is rebuilt."}
      </p>
      <input type="hidden" value={settingsPath} readOnly />
    </div>
  );
}
