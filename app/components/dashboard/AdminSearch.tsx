"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./AdminSearch.module.css";

type Result = {
  type: "agency" | "site";
  id: string;
  label: string;
  sublabel: string;
  href: string;
};

export function AdminSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Stale results from a previous longer query are harmless here — the
    // dropdown only renders when query.trim().length >= 2 anyway, so a
    // short query just hides them rather than needing to clear them.
    if (query.trim().length < 2) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/admin/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data: { results: Result[] }) => {
          setResults(data.results);
          setActiveIndex(0);
        })
        .catch(() => {
          // Aborted or network error — leave stale results alone.
        });
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectResult(result: Result) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(result.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectResult(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <input
        className={styles.input}
        placeholder="Search business name, PID, or SMB ID…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && query.trim().length >= 2 && (
        <div className={styles.dropdown}>
          {results.length === 0 ? (
            <div className={styles.empty}>No matches.</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                className={`${styles.item} ${i === activeIndex ? styles.itemActive : ""}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => selectResult(r)}
              >
                <div className={styles.itemLabel}>
                  {r.label} <span className={styles.itemSub}>({r.type === "agency" ? "Partner" : "SMB"})</span>
                </div>
                <div className={styles.itemSub}>{r.sublabel}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
