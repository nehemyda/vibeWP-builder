import shell from "./dashboard-shell.module.css";
import { SmtpTestButton } from "./SmtpTestButton";

/**
 * The mail-account form, shared by an agency and a client.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT LEADS WITH WHAT IS ALREADY TRUE
 *
 * Most people opening this page do not have a problem — their mail already
 * sends through the platform. So it says so first, and presents the fields as
 * "use your own instead" rather than as something unfinished. A settings page
 * that looks broken when nothing is wrong generates support, not sign-ups.
 */

const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--muted, #79808f)",
  marginBottom: "0.3rem",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  border: "1px solid var(--line, #e6e8ee)",
  borderRadius: 9,
  font: "inherit",
  fontSize: "0.9rem",
  background: "var(--surface, #fff)",
};

export function SmtpForm({
  action,
  testAction,
  testDefaultTo,
  current,
  activeLevel,
  activeFrom,
  ownLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** This level's own row, if one exists. */
  current: {
    host: string | null;
    port: number;
    username: string | null;
    fromEmail: string | null;
    fromName: string;
    secure: boolean;
    hasPassword: boolean;
  } | null;
  /** Which level actually sends today. */
  activeLevel: "site" | "agency" | "global" | null;
  activeFrom: string | null;
  /** "this site" or "your agency", for the sentence. */
  ownLabel: string;
  /** Sends a test using the values currently typed. */
  testAction: (formData: FormData) => Promise<{ ok: true; to: string } | { ok: false; error: string }>;
  /** Whoever is looking at the page, as the default recipient. */
  testDefaultTo: string;
}) {
  const usingOwn = activeLevel === "site" || activeLevel === "agency";

  return (
    <div className={shell.panel} style={{ padding: "1.3rem", maxWidth: "36rem" }}>
      <p style={{ margin: "0 0 1.1rem", fontSize: "0.9rem", lineHeight: 1.6, color: "var(--ink-2, #4a5160)" }}>
        {activeLevel === null ? (
          <>No mail account is set up anywhere yet, so notifications can&rsquo;t be sent.</>
        ) : usingOwn ? (
          <>
            Enquiry emails are sent from <strong>{activeFrom}</strong>, using {ownLabel}&rsquo;s own
            mail account.
          </>
        ) : (
          <>
            Enquiry emails are sent from <strong>{activeFrom}</strong> using the platform&rsquo;s
            mail account. Add your own below to send from your address and name instead.
          </>
        )}
      </p>

      {/*
        suppressHydrationWarning because password managers inject attributes
        into login-shaped forms before React hydrates — Myki adds
        data-myki-form-1, 1Password and LastPass add their own. The server HTML
        cannot contain them, so React reports a mismatch that is not ours and
        that no change here can prevent.

        Deliberately narrow: it covers this element's own attributes only, so a
        genuine mismatch in the fields inside is still reported.
      */}
      <form
        action={action}
        suppressHydrationWarning
        style={{ display: "grid", gap: "0.8rem" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.8rem" }}>
          <div>
            <label style={label} htmlFor="host">Server</label>
            <input id="host" name="host" defaultValue={current?.host ?? ""} placeholder="smtp.yourdomain.com" style={input} />
          </div>
          <div>
            <label style={label} htmlFor="port">Port</label>
            <input id="port" name="port" defaultValue={current?.port ?? 587} style={input} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
          <div>
            <label style={label} htmlFor="username">Username</label>
            <input id="username" name="username" defaultValue={current?.username ?? ""} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="password">Password</label>
            {/* Never echoed back. Blank means "keep what is stored", which is why
                the placeholder says so rather than looking empty. */}
            <input
              id="password"
              name="password"
              type="password"
              placeholder={current?.hasPassword ? "•••••••• (unchanged)" : ""}
              style={input}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
          <div>
            <label style={label} htmlFor="fromEmail">Send from</label>
            <input id="fromEmail" name="fromEmail" defaultValue={current?.fromEmail ?? ""} placeholder="hello@yourdomain.com" style={input} />
          </div>
          <div>
            <label style={label} htmlFor="fromName">Sender name</label>
            <input id="fromName" name="fromName" defaultValue={current?.fromName ?? ""} placeholder="Your business" style={input} />
          </div>
        </div>

        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.88rem" }}>
          <input type="checkbox" name="secure" defaultChecked={current?.secure ?? false} />
          Use SSL (usually port 465)
        </label>

        <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted, #79808f)", lineHeight: 1.5 }}>
          Leave the server blank to go back to the platform&rsquo;s mail account.
          Enquiries are sent from your address with the visitor in Reply-To, so replying
          reaches them and the message isn&rsquo;t filed as spam.
        </p>

        <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`} style={{ justifySelf: "start" }}>
          Save mail settings
        </button>

        {/*
          Inside the form, so it tests what is on screen rather than what was
          saved — a wrong password can be corrected and retried without ever
          committing it.
        */}
        <div style={{ borderTop: "1px solid var(--line, #e6e8ee)", paddingTop: "0.9rem" }}>
          <SmtpTestButton action={testAction} defaultTo={testDefaultTo} />
        </div>
      </form>
    </div>
  );
}
