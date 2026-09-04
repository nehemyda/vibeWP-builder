"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { smtpSettings, sites, agencies } from "@/lib/db/schema";
import { requireSiteAccess } from "@/lib/auth/require-site-access";
import { requireAgency } from "@/lib/auth/require-agency";
import { resolveSmtpForSite } from "@/lib/mail/resolve";
import { createClient } from "@/lib/supabase/server";

/**
 * An agency's or a client's own mail account.
 *
 * ─────────────────────────────────────────────────────────────────────
 * OPTIONAL BY DESIGN
 *
 * The platform's account sends everything by default. A row exists here only
 * when someone wants mail to come from THEIR domain and name — which is the
 * whole reason to configure it, and something most clients never will.
 *
 * Saving an empty host DELETES the row rather than storing a blank one. A
 * half-filled record would otherwise shadow the working account above it, and
 * "I cleared it to go back to the default" is exactly what someone means when
 * they empty the field.
 */

type Fields = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  secure: boolean;
};

function read(formData: FormData): Fields {
  return {
    host: String(formData.get("host") ?? "").trim(),
    port: Number(formData.get("port") ?? 587) || 587,
    username: String(formData.get("username") ?? "").trim(),
    // Blank means "keep what is stored" — the real value is never echoed to the
    // browser, so an empty box is not an instruction to erase it.
    password: String(formData.get("password") ?? "").trim(),
    fromEmail: String(formData.get("fromEmail") ?? "").trim(),
    fromName: String(formData.get("fromName") ?? "").trim(),
    secure: formData.get("secure") === "on",
  };
}

async function upsert(
  scope: "agency" | "site",
  owner: { agencyId?: string; siteId?: string },
  f: Fields,
) {
  const where =
    scope === "agency"
      ? and(eq(smtpSettings.scope, "agency"), eq(smtpSettings.agencyId, owner.agencyId!))
      : and(eq(smtpSettings.scope, "site"), eq(smtpSettings.siteId, owner.siteId!));

  const existing = await db.query.smtpSettings.findFirst({ where });

  if (!f.host) {
    if (existing) await db.delete(smtpSettings).where(eq(smtpSettings.id, existing.id));
    return;
  }

  if (existing) {
    await db
      .update(smtpSettings)
      .set({
        host: f.host,
        port: f.port,
        username: f.username || null,
        fromEmail: f.fromEmail || null,
        fromName: f.fromName || "VibeWP",
        secure: f.secure,
        updatedAt: new Date(),
        ...(f.password && { password: f.password }),
      })
      .where(eq(smtpSettings.id, existing.id));
    return;
  }

  await db.insert(smtpSettings).values({
    scope,
    agencyId: owner.agencyId ?? null,
    siteId: owner.siteId ?? null,
    host: f.host,
    port: f.port,
    username: f.username || null,
    password: f.password || null,
    fromEmail: f.fromEmail || null,
    fromName: f.fromName || "VibeWP",
    secure: f.secure,
  });
}

export async function saveSiteSmtpAction(smbId: string, formData: FormData): Promise<void> {
  const { site } = await requireSiteAccess(smbId);
  await upsert("site", { siteId: site.id }, read(formData));
  revalidatePath("/dashboard", "layout");
}

export async function saveAgencySmtpAction(partnerId: string, formData: FormData): Promise<void> {
  const { agency } = await requireAgency();
  // No agency, or the wrong one: change nothing rather than guess which was
  // meant. An agency id in a URL is not authority to write to it.
  if (!agency || agency.partnerId !== partnerId) return;
  await upsert("agency", { agencyId: agency.id }, read(formData));
  revalidatePath("/agency", "layout");
}

/**
 * Which account a site's mail would actually go through, and from where.
 *
 * Shown in the UI because "email works" and "email works because the PLATFORM
 * is sending it" are different facts, and only one of them means the client's
 * branding is on the message.
 */
export async function describeSmtpForSite(siteId: string) {
  const resolved = await resolveSmtpForSite(siteId);
  if (!resolved) return { configured: false as const };
  return {
    configured: true as const,
    level: resolved.level,
    fromEmail: resolved.fromEmail,
    fromName: resolved.fromName,
  };
}

/**
 * Proves the settings actually work, before a client finds out they don't.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT TESTS THE VALUES ON SCREEN, NOT THE SAVED ONES
 *
 * Testing what is stored means saving a broken configuration to discover it is
 * broken. This takes the values currently typed, so someone can correct a
 * password and try again without ever committing one that does not work.
 *
 * The password is the exception: it is never rendered back to the browser, so
 * a blank box means "the stored one" rather than "no password".
 *
 * WHY THE REAL ERROR IS RETURNED
 *
 * "Could not send" is the answer that made this necessary in the first place.
 * Authentication failed, host not found and connection timed out need three
 * different actions from the person reading it, so they are three different
 * messages.
 */
export async function testSmtpAction(
  scope: "agency" | "site",
  ownerId: string,
  formData: FormData,
): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  /*
   * Authorise for the right scope, and take the signed-in address as the
   * default recipient. `profiles` does not store an email — it lives on the
   * auth user — so it comes from the session rather than the profile row.
   */
  let sessionEmail = "";
  if (scope === "site") {
    const { user } = await requireSiteAccess(ownerId);
    sessionEmail = user.email ?? "";
  } else {
    const { agency } = await requireAgency();
    if (!agency || agency.partnerId !== ownerId) {
      return { ok: false, error: "That agency isn't yours." };
    }
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    sessionEmail = data.user?.email ?? "";
  }

  const to = String(formData.get("testTo") ?? "").trim() || sessionEmail;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return { ok: false, error: "Enter an address to send the test to." };
  }

  const f = read(formData);

  // Fall back to the stored password when the box was left blank.
  let password = f.password;
  if (!password) {
    const where =
      scope === "site"
        ? and(eq(smtpSettings.scope, "site"), eq(smtpSettings.siteId, (await requireSiteAccess(ownerId)).site.id))
        : and(eq(smtpSettings.scope, "agency"), eq(smtpSettings.agencyId, (await requireAgency()).agency?.id ?? ""));
    const existing = await db.query.smtpSettings.findFirst({ where });
    password = existing?.password ?? "";
  }

  if (!f.host || !f.fromEmail) {
    return { ok: false, error: "Fill in the server and the send-from address first." };
  }

  try {
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host: f.host,
      port: f.port,
      secure: f.secure,
      auth: f.username ? { user: f.username, pass: password } : undefined,
      // Fail fast: a settings page that hangs for two minutes on a wrong port
      // teaches nothing.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    await transport.sendMail({
      from: `"${f.fromName || "VibeWP"}" <${f.fromEmail}>`,
      to,
      subject: "SMTP test from VibeWP",
      text:
        "This is a test.\n\nIf you are reading it, enquiry notifications will reach you " +
        `from ${f.fromEmail}.`,
    });

    return { ok: true, to };
  } catch (err) {
    return { ok: false, error: explainSmtpError(err) };
  }
}

/**
 * Turns a mail library error into something a person can act on.
 *
 * The raw messages are accurate and useless — "EAUTH", "ECONNREFUSED",
 * "ENOTFOUND" — and the difference between them is the difference between
 * fixing a password and fixing a hostname.
 */
function explainSmtpError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string };
  const code = e?.code ?? "";
  const message = e?.message ?? String(err);

  if (code === "EAUTH" || e?.responseCode === 535) {
    return "The server rejected that username or password.";
  }
  if (code === "ENOTFOUND" || code === "EDNS") {
    return "That server address doesn't exist — check the hostname.";
  }
  if (code === "ECONNREFUSED") {
    return "The server refused the connection — check the port.";
  }
  if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION") {
    return "Couldn't reach the server. Check the hostname, the port, and whether SSL should be on.";
  }
  if (e?.responseCode === 550 || e?.responseCode === 553) {
    return "The server refused the send-from address. It usually has to match the account.";
  }
  // Unrecognised: show what the server said rather than inventing a summary.
  return message.slice(0, 200);
}
