import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, cp, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const run = promisify(execFile);

/**
 * Provisions and updates WordPress installs on this machine, via WP-CLI.
 *
 * This is the local implementation of one narrow interface — provision a
 * site, push a page. A hosted driver can replace it later without anything
 * above this file changing, because everything here is expressed in terms
 * of "a site" rather than "a directory on my Mac".
 *
 * Paths are resolved from env so a different machine can override them
 * without code changes.
 */

const PHP = process.env.VIBEWP_PHP_BIN ?? "/opt/homebrew/opt/php@8.3/bin/php";
const WP_CLI = process.env.VIBEWP_WP_CLI ?? "/opt/homebrew/Cellar/wp-cli/2.12.0/bin/wp";
const MYSQL = process.env.VIBEWP_MYSQL_BIN ?? "/Applications/XAMPP/xamppfiles/bin/mysql";
const MYSQL_SOCK =
  process.env.VIBEWP_MYSQL_SOCK ?? "/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock";
const SITES_ROOT = process.env.VIBEWP_SITES_ROOT ?? join(homedir(), "vibewp-sites");
const THEME_SRC =
  process.env.VIBEWP_THEME_SRC ??
  join(process.cwd(), "..", "assets", "ai-builder", "themes", "vibewp");
const PORT_BASE = Number(process.env.VIBEWP_PORT_BASE ?? 8801);

/** WP-CLI needs generous memory: core extraction OOMs at the 128M default. */
async function wp(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await run(PHP, ["-d", "memory_limit=1G", WP_CLI, ...args], {
    cwd,
    maxBuffer: 1024 * 1024 * 32,
    timeout: 300_000,
  });
  return stdout.trim();
}

async function mysql(sql: string): Promise<void> {
  await run(MYSQL, ["-u", "root", `--socket=${MYSQL_SOCK}`, "-e", sql], { timeout: 60_000 });
}

/** MySQL identifiers can't contain the hyphens an SMB ID uses. */
function dbNameFor(smbId: string): string {
  return `vibewp_${smbId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

/**
 * Ports are derived from the site's own ID rather than a counter, so the
 * same site always gets the same port without needing to store a sequence.
 * Collisions are possible in principle; the DB records the actual port used.
 */
function portFor(smbId: string): number {
  let hash = 0;
  for (const ch of smbId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PORT_BASE + (hash % 150);
}

export type ProvisionResult = {
  installPath: string;
  url: string;
  port: number;
  dbName: string;
  adminUser: string;
  adminPassword: string;
};

/**
 * Creates a fresh WordPress for a site: database, core, config, install,
 * and the vibewp theme activated. Idempotent enough to re-run — core
 * download and config use --force, and the database is created IF NOT
 * EXISTS — but it will not clobber an install that already has content.
 */
export async function provisionSite(opts: {
  smbId: string;
  siteName: string;
  adminEmail: string;
}): Promise<ProvisionResult> {
  const { smbId, siteName, adminEmail } = opts;
  const installPath = join(SITES_ROOT, smbId);
  const dbName = dbNameFor(smbId);
  const port = portFor(smbId);
  const url = `http://localhost:${port}`;
  const adminUser = "vibewp";
  const adminPassword = randomBytes(12).toString("base64url");

  await mkdir(installPath, { recursive: true });
  await mysql(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );

  await wp(["core", "download", `--path=${installPath}`, "--force"]);
  await wp([
    "config",
    "create",
    `--path=${installPath}`,
    `--dbname=${dbName}`,
    "--dbuser=root",
    "--dbpass=",
    `--dbhost=localhost:${MYSQL_SOCK}`,
    "--force",
  ]);

  const installed = await wp(["core", "is-installed", `--path=${installPath}`]).then(
    () => true,
    () => false,
  );

  let effectiveUrl = url;
  let effectivePort = port;

  if (installed) {
    // Adopting an install that already exists — believe ITS url rather than
    // the one we would have derived, or we would hand out a link to a port
    // nothing is serving.
    const existingUrl = await wp(["option", "get", "siteurl", `--path=${installPath}`]).catch(
      () => "",
    );
    if (existingUrl) {
      effectiveUrl = existingUrl;
      const parsedPort = Number(new URL(existingUrl).port);
      if (Number.isFinite(parsedPort) && parsedPort > 0) effectivePort = parsedPort;
    }
  } else {
    await wp([
      "core",
      "install",
      `--path=${installPath}`,
      `--url=${url}`,
      `--title=${siteName}`,
      `--admin_user=${adminUser}`,
      `--admin_password=${adminPassword}`,
      `--admin_email=${adminEmail}`,
      "--skip-email",
    ]);
  }

  // Ship the theme with the install so the site is self-contained and keeps
  // working even if this platform disappears.
  await cp(THEME_SRC, join(installPath, "wp-content", "themes", "vibewp"), {
    recursive: true,
    force: true,
  });
  await wp(["theme", "activate", "vibewp", `--path=${installPath}`]);

  // Only write credentials for an install we actually created — otherwise we
  // would overwrite the real password with one that was never set.
  if (!installed) {
    await writeFile(
      join(SITES_ROOT, `${smbId}.credentials.txt`),
      `url=${effectiveUrl}\nadmin_user=${adminUser}\nadmin_password=${adminPassword}\n`,
      "utf8",
    );
  }

  return {
    installPath,
    url: effectiveUrl,
    port: effectivePort,
    dbName,
    adminUser,
    adminPassword,
  };
}

/**
 * Creates the page if its slug is absent, updates it if present — the
 * "first export creates, later exports update" rule, at page level.
 * Returns the resulting page's permalink.
 */
export async function upsertPage(opts: {
  installPath: string;
  slug: string;
  title: string;
  blockMarkup: string;
  asFrontPage?: boolean;
}): Promise<{ postId: number; url: string }> {
  const { installPath, slug, title, blockMarkup, asFrontPage } = opts;

  // Content goes via a temp file: block markup is long and full of quotes,
  // which is exactly what breaks when passed as a shell argument.
  const tmp = join(installPath, `.vibewp-import-${slug}.html`);
  await writeFile(tmp, blockMarkup, "utf8");

  const script = `
    $slug = ${JSON.stringify(slug)};
    $title = ${JSON.stringify(title)};
    $content = file_get_contents(${JSON.stringify(tmp)});
    $existing = get_page_by_path($slug, OBJECT, "page");
    $args = [
      "post_title"   => $title,
      "post_name"    => $slug,
      "post_content" => $content,
      "post_status"  => "publish",
      "post_type"    => "page",
    ];
    if ($existing) { $args["ID"] = $existing->ID; $id = wp_update_post($args, true); }
    else { $id = wp_insert_post($args, true); }
    if (is_wp_error($id)) { WP_CLI::error($id->get_error_message()); }
    ${
      asFrontPage
        ? `update_option("show_on_front", "page"); update_option("page_on_front", $id);`
        : ""
    }
    echo json_encode(["postId" => (int) $id, "url" => get_permalink($id)]);
  `;

  const out = await wp(["eval", script, `--path=${installPath}`]);
  const parsed = JSON.parse(out) as { postId: number; url: string };
  return parsed;
}

/** True if WP-CLI and the database client are actually available here. */
export async function driverAvailable(): Promise<{ ok: boolean; reason?: string }> {
  try {
    await run(PHP, ["-v"], { timeout: 10_000 });
  } catch {
    return { ok: false, reason: `PHP not found at ${PHP}` };
  }
  try {
    await run(MYSQL, ["-u", "root", `--socket=${MYSQL_SOCK}`, "-e", "SELECT 1;"], {
      timeout: 10_000,
    });
  } catch {
    return { ok: false, reason: "Database not reachable — is XAMPP's MySQL running?" };
  }
  return { ok: true };
}
