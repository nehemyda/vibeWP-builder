import nodemailer from "nodemailer";
import { resolveSmtpForSite } from "./resolve";

/**
 * Tells the business an enquiry arrived.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FROM US, REPLY-TO THEM
 *
 * The obvious thing is to send From: the visitor's address, so replying works.
 * It is also the single most common reason form mail lands in spam: our server
 * is not authorised to send as gmail.com, so SPF and DMARC fail.
 *
 * So the message is From: an address we ARE authorised to send as, with the
 * visitor in Reply-To. Hitting reply still reaches them, and the mail arrives.
 *
 * NEVER THROWS
 *
 * A submission is already stored before this runs. Mail failing must not fail
 * the request, or a temporary SMTP problem would turn a captured lead into a
 * visitor being told something went wrong — losing the enquiry to protect the
 * notification about it.
 */
export async function notifyNewLead(opts: {
  siteId: string;
  siteName: string;
  to: string;
  formName: string;
  data: Record<string, string>;
  leadUrl: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const { siteId, siteName, to, formName, data, leadUrl } = opts;

  const recipients = to
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));
  if (recipients.length === 0) return { sent: false, reason: "no valid recipient" };

  const smtp = await resolveSmtpForSite(siteId);
  if (!smtp) return { sent: false, reason: "no SMTP configured at any level" };

  // Whoever left it, so Reply-To can reach them.
  const replyTo = Object.entries(data).find(
    ([k, v]) => k.toLowerCase().includes("email") && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  )?.[1];

  const rows = Object.entries(data)
    .filter(([, v]) => String(v ?? "").trim() !== "")
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#79808f;vertical-align:top;white-space:nowrap">${escapeHtml(
          k,
        )}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(String(v))}</td></tr>`,
    )
    .join("");

  const text = Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.username ? { user: smtp.username, pass: smtp.password ?? "" } : undefined,
    });

    await transport.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: recipients,
      replyTo,
      // Named so a full inbox still shows which site and who.
      subject: `New enquiry from ${siteName}${replyTo ? ` — ${replyTo}` : ""}`,
      text: `${text}\n\nView it: ${leadUrl}`,
      html:
        `<div style="font:15px/1.5 system-ui,-apple-system,sans-serif;color:#12151c">` +
        `<p style="margin:0 0 14px">New enquiry via <strong>${escapeHtml(formName)}</strong> on ${escapeHtml(
          siteName,
        )}.</p>` +
        `<table style="border-collapse:collapse;font-size:14px">${rows}</table>` +
        `<p style="margin:18px 0 0"><a href="${escapeHtml(leadUrl)}">Open it in your dashboard</a></p>` +
        `</div>`,
    });

    return { sent: true };
  } catch (err) {
    console.error("[forms] notification failed:", err instanceof Error ? err.message : err);
    return { sent: false, reason: "send failed" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
