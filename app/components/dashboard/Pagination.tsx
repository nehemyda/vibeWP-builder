import Link from "next/link";
import styles from "./Pagination.module.css";

/** Server-renderable — just links with a ?page= query param, no client state needed. */
export function Pagination({
  page,
  totalPages,
  basePath,
}: {
  page: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const sep = basePath.includes("?") ? "&" : "?";

  return (
    <div className={styles.pagination}>
      <Link
        href={`${basePath}${sep}page=${Math.max(1, page - 1)}`}
        className={`${styles.link} ${prevDisabled ? styles.disabled : ""}`}
        aria-disabled={prevDisabled}
      >
        ← Prev
      </Link>
      <span>
        Page {page} of {totalPages}
      </span>
      <Link
        href={`${basePath}${sep}page=${Math.min(totalPages, page + 1)}`}
        className={`${styles.link} ${nextDisabled ? styles.disabled : ""}`}
        aria-disabled={nextDisabled}
      >
        Next →
      </Link>
    </div>
  );
}
