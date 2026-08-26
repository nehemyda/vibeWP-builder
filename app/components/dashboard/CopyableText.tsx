"use client";

import { useState, type ReactNode } from "react";
import styles from "./CopyableText.module.css";

/** Wraps any inline content (a badge, a name) and copies `value` to the clipboard on click. */
export function CopyableText({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can be denied by the browser — silently no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.copyable} ${className ?? ""}`}
      title={copied ? "Copied!" : "Click to copy"}
    >
      {children}
      <span className={`${styles.icon} ${copied ? styles.copied : ""}`}>
        {copied ? "✓" : "⧉"}
      </span>
    </button>
  );
}
