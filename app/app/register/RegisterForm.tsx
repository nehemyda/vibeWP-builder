"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/auth-shared.module.css";
import { createClient } from "@/lib/supabase/client";
import { completeSignup } from "@/app/actions/auth";

const oauthEnabled = {
  google: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true",
  github: process.env.NEXT_PUBLIC_GITHUB_OAUTH_ENABLED === "true",
};

export function RegisterForm({ prompt }: { prompt: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loginHref = prompt
    ? `/login?prompt=${encodeURIComponent(prompt)}`
    : "/login";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!agreed) {
      setError("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, agency_name: company } },
    });

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (!data.session) {
      setInfo("Check your email to confirm your account, then log in.");
      return;
    }

    startTransition(async () => {
      try {
        const { redirectTo } = await completeSignup({
          fullName: name,
          agencyName: company,
          prompt,
        });
        router.push(redirectTo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className={styles.card}>
      <h1>Create your account</h1>
      <p className={styles.sub}>
        Start building exportable WordPress sites in minutes.
      </p>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {info && <div className={styles.infoBanner}>{info}</div>}

      <div className={styles.oauthRow}>
        <button
          type="button"
          className={styles.oauthBtn}
          disabled={!oauthEnabled.google}
          title={
            oauthEnabled.google ? undefined : "Google sign-in not configured yet"
          }
        >
          <GoogleIcon className={styles.oauthIcon} />
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
          <GitHubIcon className={styles.oauthIcon} />
          Continue with GitHub
        </button>
      </div>

      <div className={styles.divider}>or sign up with email</div>

      <form onSubmit={onSubmit}>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              type="text"
              placeholder="Jordan Lee"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="company">Agency name</label>
            <input
              id="company"
              type="text"
              placeholder="Acme Web Co. (optional)"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="email">Work email</label>
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
            minLength={8}
            required
          />
          <p className={styles.hint}>At least 8 characters.</p>
        </div>

        <label className={styles.terms}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          I agree to the <a href="#">Terms of Service</a> and{" "}
          <a href="#">Privacy Policy</a>
        </label>

        <button type="submit" className={styles.btnPrimary} disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className={styles.footerLink}>
        Already building with us? <Link href={loginHref}>Log in</Link>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#181717" d="M12 .3a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.3 3.5 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .3z" />
    </svg>
  );
}
