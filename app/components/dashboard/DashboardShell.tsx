"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import styles from "./dashboard-shell.module.css";
import { signOut } from "@/app/actions/auth";
import { NotificationBell } from "./NotificationBell";

export type NavItem = {
  icon: string;
  label: string;
  href: string;
  /**
   * Reserves a slot for something not built yet: shown greyed and not
   * clickable.
   *
   * Exists so planned structure can be visible without shipping links that
   * 404 — the agency sidebar previously carried exactly that kind of dead
   * link and it had to be removed.
   */
  soon?: boolean;
};
export type NavGroup = { label: string; items: NavItem[] };

export function DashboardShell({
  navGroups,
  activeHref,
  userName,
  userRole,
  title,
  subtitle,
  topActions,
  children,
}: {
  navGroups: NavGroup[];
  activeHref: string;
  userName: string;
  userRole: string;
  title: string;
  subtitle: ReactNode;
  topActions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.shell}>
      {open && (
        <div className={styles.scrim} onClick={() => setOpen(false)} />
      )}

      <aside
        className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}
      >
        <div className={styles.brand}>
          <span className={styles.brandMark} />
          VibeWP
        </div>
        {navGroups.map((group) => (
          <div className={styles.navGroup} key={group.label}>
            <div className={styles.navLabel}>{group.label}</div>
            {group.items.map((item) =>
              item.soon ? (
                <span
                  key={item.label}
                  className={`${styles.navItem} ${styles.navSoon}`}
                  aria-disabled="true"
                  title={`${item.label} — not built yet`}
                >
                  <span className={styles.ic}>{item.icon}</span>
                  {item.label}
                  <span className={styles.soonTag}>soon</span>
                </span>
              ) : (
              <Link
                key={item.label}
                href={item.href}
                className={`${styles.navItem} ${
                  item.href === activeHref ? styles.active : ""
                }`}
                onClick={() => setOpen(false)}
              >
                <span className={styles.ic}>{item.icon}</span>
                {item.label}
              </Link>
              ),
            )}
          </div>
        ))}
        <div className={styles.sidebarFoot}>
          <Link
            href="/profile"
            className={styles.who}
            style={{ display: "flex", alignItems: "center", gap: "0.65rem", flex: 1, minWidth: 0 }}
            onClick={() => setOpen(false)}
          >
            <div className={styles.avatar} />
            <div style={{ minWidth: 0 }}>
              <div className={styles.name}>{userName}</div>
              <div className={styles.role}>{userRole}</div>
            </div>
          </Link>
          <form action={signOut} style={{ marginLeft: "auto" }}>
            <button type="submit" className={styles.signOutBtn} title="Sign out">
              ↪
            </button>
          </form>
        </div>
      </aside>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarTitle}>
            <button
              className={styles.menuBtn}
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <div>
              <h1>{title}</h1>
              <p className={styles.sub}>{subtitle}</p>
            </div>
          </div>
          <div className={styles.topActions}>
            {topActions}
            <NotificationBell />
          </div>
        </div>

        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
