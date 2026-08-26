import Link from "next/link";
import styles from "@/app/auth-shared.module.css";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string }>;
}) {
  const { prompt } = await searchParams;

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
            Already have an account? <a href="/login">Log in</a>
          </div>
        </nav>

        <div className={styles.center}>
          <RegisterForm prompt={prompt ?? null} />
        </div>
      </div>
    </>
  );
}
