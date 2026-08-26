import Link from "next/link";
import styles from "./UserTabs.module.css";

export function UserTabs({ active }: { active: "users" | "permissions" }) {
  return (
    <div className={styles.tabs}>
      <Link href="/admin/users" className={`${styles.tab} ${active === "users" ? styles.tabActive : ""}`}>
        Users
      </Link>
      <Link
        href="/admin/users/permissions"
        className={`${styles.tab} ${active === "permissions" ? styles.tabActive : ""}`}
      >
        Roles & Permissions
      </Link>
    </div>
  );
}
