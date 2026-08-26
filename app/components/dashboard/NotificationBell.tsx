"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./NotificationBell.module.css";

type Item = { id: string; text: string; createdAt: string };

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/notifications")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items: Item[] }) => {
        if (!cancelled) {
          setItems(data.items ?? []);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellBtn}
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        🔔
        {items.length > 0 && <span className={styles.badge}>{items.length > 9 ? "9+" : items.length}</span>}
      </button>
      {open && (
        <div className={styles.dropdown}>
          <div className={styles.header}>Recent activity</div>
          {!loaded ? (
            <div className={styles.empty}>Loading…</div>
          ) : items.length === 0 ? (
            <div className={styles.empty}>Nothing new.</div>
          ) : (
            items.map((item) => (
              <div className={styles.item} key={item.id}>
                <div className={styles.itemText}>{item.text}</div>
                <div className={styles.itemTime}>{timeAgo(item.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
