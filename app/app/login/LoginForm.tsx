"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/auth-shared.module.css";
import { createClient } from "@/lib/supabase/client";
import { afterLogin } from "@/app/actions/auth";

const oauthEnabled = {
  google: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true",
  github: process.env.NEXT_PUBLIC_GITHUB_OAUTH_ENABLED === "true",
};

export function LoginForm({ prompt }: { prompt: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const registerHref = prompt
    ? `/register?prompt=${encodeURIComponent(prompt)}`
    : "/register";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    startTransition(async () => {
      try {
        const { redirectTo } = await afterLogin({ prompt });
        router.push(redirectTo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className={styles.card}>
      <h1>Welcome back</h1>
      <p className={styles.sub}>Log in to keep building on VibeWP.</p>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.oauthRow}>
        <button
          type="button"
          className={styles.oauthBtn}
          disabled={!oauthEnabled.google}
          title={
            oauthEnabled.google ? undefined : "Google sign-in not configured yet"
          }
        >
          Continue with Google
        </button>
        <button
          type="button"
          className={styles.oauthBtn}
          disabled={!oauthEnabled.github}
          title={
            oauthEnabled.github ? undefined : "GitHub sign-in not configured yet"
          }
        >
          Continue with GitHub
        </button>
      </div>

      <div className={styles.divider}>or continue with email</div>

      <form suppressHydrationWarning onSubmit={onSubmit}>
        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className={styles.rowBetween}>
          <label className={styles.remember}>
            <input type="checkbox" /> Remember me
          </label>
          <a href="#">Forgot password?</a>
        </div>

        <button type="submit" className={styles.btnPrimary} disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>

      <div className={styles.footerLink}>
        Don&apos;t have an account? <Link href={registerHref}>Sign up free</Link>
      </div>
    </div>
  );
}
