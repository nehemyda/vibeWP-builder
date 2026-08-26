"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import shell from "@/components/dashboard/dashboard-shell.module.css";

const inputStyle = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.9rem",
} as const;

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    setPassword("");
    setConfirm("");
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {error && (
        <div style={{ color: "#b3261e", fontSize: "0.85rem" }}>{error}</div>
      )}
      {success && (
        <div style={{ color: "var(--good)", fontSize: "0.85rem" }}>Password updated.</div>
      )}
      <div>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
          New password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          placeholder="••••••••"
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
          Confirm new password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={inputStyle}
          placeholder="••••••••"
        />
      </div>
      <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
