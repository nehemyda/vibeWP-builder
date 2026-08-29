"use client";

import { useEffect, useState } from "react";
import styles from "./builder.module.css";

/**
 * Everything about this site, one click from the builder.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A DRAWER AND NOT A PAGE
 *
 * These are facts you want WHILE building — the live URL to check something,
 * the ID to quote in a support message, the DNS records to read out to a client
 * on the phone. Sending someone to a separate screen to read one value means
 * leaving the canvas and coming back, so it opens over the builder and closes
 * again without losing anything.
 */

export type SiteDetails = {
  siteName: string;
  smbId: string;
  partnerId: string | null;
  plan: string | null;
  status: string | null;
  /** The live site, once exported. */
  wpUrl: string | null;
  domain: string | null;
  createdAt: string | null;
  lastEditedAt: string | null;
  pageCount: number;
  /** Where clients point DNS. Null when an administrator has not set them. */
  hostingIpv4: string | null;
  hostingCname: string | null;
};

function Row({ label, value, copyable }: { label: string; value: string | null; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.sdRow}>
      <span className={styles.sdLabel}>{label}</span>
      <span className={styles.sdValue}>
        {value ? (
          <>
            <code>{value}</code>
            {copyable && (
              <button
                type="button"
                className={styles.sdCopy}
                onClick={() => {
                  void navigator.clipboard.writeText(value);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                }}
                aria-label={`Copy ${label}`}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </>
        ) : (
          <em className={styles.sdEmpty}>Not set</em>
        )}
      </span>
    </div>
  );
}

export function SiteDetailsDrawer({
  open,
  onClose,
  details,
}: {
  open: boolean;
  onClose: () => void;
  details: SiteDetails;
}) {
  // Escape closes it, as every overlay in the builder should.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasHosting = Boolean(details.hostingIpv4 || details.hostingCname);

  return (
    <>
      <div className={styles.sdScrim} onClick={onClose} aria-hidden="true" />
      <aside className={styles.sdPanel} role="dialog" aria-modal="true" aria-label="Site details">
        <header className={styles.sdHeader}>
          <h2 className={styles.sdTitle}>{details.siteName}</h2>
          <button type="button" className={styles.sdClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className={styles.sdBody}>
          <section className={styles.sdSection}>
            <h3 className={styles.sdSectionTitle}>Site</h3>
            <Row label="Site ID" value={details.smbId} copyable />
            {details.partnerId && <Row label="Partner ID" value={details.partnerId} copyable />}
            <Row label="Plan" value={details.plan} />
            <Row label="Status" value={details.status} />
            <Row label="Pages" value={String(details.pageCount)} />
            <Row label="Created" value={details.createdAt} />
            <Row label="Last edited" value={details.lastEditedAt} />
          </section>

          <section className={styles.sdSection}>
            <h3 className={styles.sdSectionTitle}>Address</h3>
            <Row label="Domain" value={details.domain} copyable />
            <Row label="Live site" value={details.wpUrl} copyable />
            {details.wpUrl && (
              <a className={styles.sdLink} href={details.wpUrl} target="_blank" rel="noreferrer">
                Open the live site ↗
              </a>
            )}
          </section>

          <section className={styles.sdSection}>
            <h3 className={styles.sdSectionTitle}>Hosting &amp; DNS</h3>
            {hasHosting ? (
              <>
                <p className={styles.sdHint}>
                  Enter these at the domain registrar. Changes can take a few hours to
                  take effect worldwide.
                </p>
                <Row label="A record (@)" value={details.hostingIpv4} copyable />
                <Row label="CNAME (www)" value={details.hostingCname} copyable />
              </>
            ) : (
              /*
               * Deliberately blank rather than illustrative.
               *
               * An example IP here would be indistinguishable from a real one to
               * the person typing it into a registrar, and would point a live
               * customer domain at a machine that is not ours. Saying nothing is
               * the only safe thing to say when nobody has configured it.
               */
              <p className={styles.sdHint}>
                No hosting records have been set for this platform yet, so there is
                nothing to point a domain at. An administrator can add them in
                Platform settings.
              </p>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
