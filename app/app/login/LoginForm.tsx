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

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/* The same eye, with a line through it — not a different glyph, so the two
   states read as one control rather than as two unrelated icons. */
function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function LoginForm({ prompt }: { prompt: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /*
   * Off by default — a password field defaults to hidden, and the toggle is
   * something a person reaches for, not something the page decides for them.
   */
  const [showPassword, setShowPassword] = useState(false);
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
          <div className={styles.passwordWrap}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className={styles.passwordToggle}
              /*
               * aria-pressed, not aria-label alone: this is a two-state
               * toggle, and the pressed state is what tells a screen reader
               * which one is currently true without it having to infer that
               * from the label text changing.
               */
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {/*
                The icon shows the field's CURRENT state, not the action the
                button performs — the reverse of the aria-label above. Hidden
                (the default) is the crossed eye; revealed is the open one.
                Flipped from the first version, which did it the Material/
                GitHub way (icon = what clicking will do); this is the
                1Password/LastPass convention instead, per the brief above.
              */}
              {showPassword ? <EyeIcon /> : <EyeOffIcon />}
            </button>
          </div>
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
