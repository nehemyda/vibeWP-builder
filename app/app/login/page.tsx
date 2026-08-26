import Link from "next/link";
import styles from "@/app/auth-shared.module.css";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; locked?: string }>;
}) {
  const { prompt, locked } = await searchParams;

  return (
    <>
      <div className={styles.mesh} />
      <div className={styles.page}>
        <nav className={styles.nav}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark} />
            VibeWP
          </Link>
          <div className={styles.navActions}>
            New here? <a href="/register">Create an account</a>
          </div>
        </nav>

        <div className={styles.center}>
          {locked && (
            <p style={{ color: "#b3261e", marginBottom: "1rem", textAlign: "center" }}>
              This account&apos;s agency is suspended, archived, or deleted. Contact support.
            </p>
          )}
          <LoginForm prompt={prompt ?? null} />
        </div>
      </div>
    </>
  );
}
