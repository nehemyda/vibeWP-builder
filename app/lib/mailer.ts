import nodemailer from "nodemailer";
import { getSmtpSettings } from "@/lib/smtp-settings";

/** Sends an email via the platform's configured SMTP server. Throws if not configured or on send failure. */
export async function sendMail(opts: { to: string; subject: string; text: string }) {
  const settings = await getSmtpSettings();
  if (!settings.host || !settings.username || !settings.password || !settings.fromEmail) {
    throw new Error("SMTP isn't fully configured yet — fill in host, username, password, and from address.");
  }

  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.username, pass: settings.password },
  });

  await transport.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  });
}
