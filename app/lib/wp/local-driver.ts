import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, cp, writeFile, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";

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

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

/**
 * True if something accepts TCP connections on this port, over EITHER stack.
 *
 * Both are checked because PHP's built-in server resolves "localhost" and
 * binds to whatever comes back — on macOS that is IPv6 (::1) only. Probing
 * just 127.0.0.1 reported a perfectly healthy server as down, and the
 * caller then declared the export failed.
 */
async function isPortListening(port: number, timeoutMs = 800): Promise<boolean> {
  const [v4, v6] = await Promise.all([
    canConnect("127.0.0.1", port, timeoutMs),
    canConnect("::1", port, timeoutMs),
  ]);
  return v4 || v6;
}

/**
 * Makes sure a provisioned site is actually being served.
 *
 * Installing WordPress only puts files on disk and rows in a database —
 * without a web server the URL refuses connections, which is exactly what
 * a freshly provisioned site did. The process is detached and unref'd so it
 * outlives the request that started it; it will not survive a reboot, hence
 * this is called on every export rather than only at provision time.
 */
export async function ensureSiteServing(opts: {
  installPath: string;
  port: number;
}): Promise<{ serving: boolean; error?: string }> {
  const { installPath, port } = opts;

  if (await isPortListening(port)) return { serving: true };

  try {
    // Keep output so a failure to boot can be diagnosed later.
    const logFile = await open(join(installPath, ".vibewp-server.log"), "a");
    const child = spawn(
      PHP,
      ["-d", "memory_limit=512M", WP_CLI, "server", `--path=${installPath}`, "--host=localhost", `--port=${port}`],
      { detached: true, stdio: ["ignore", logFile.fd, logFile.fd] },
    );
    child.unref();
    await logFile.close();
  } catch (err) {
    return { serving: false, error: err instanceof Error ? err.message : String(err) };
  }

  // PHP's built-in server binds quickly, but not instantly.
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (await isPortListening(port)) return { serving: true };
    await new Promise((r) => setTimeout(r, 200));
  }
  return { serving: false, error: `Server did not start on port ${port}` };
}

/**
 * Installs a must-use plugin that accepts a single-use login token.
 *
 * Nobody knows the generated admin password — it is written to a file next
 * to the install and never shown — so without this there is no practical
 * way into wp-admin. The token is minted server-side, expires in 60
 * seconds, is deleted on first use, and the plugin refuses any request that
 * did not come from the loopback interface, so it cannot act as a remote
 * back door if this install is ever exposed.
 */
async function installAutoLoginPlugin(installPath: string): Promise<void> {
  const dir = join(installPath, "wp-content", "mu-plugins");
  await mkdir(dir, { recursive: true });

  const php = `<?php
/**
 * Plugin Name: VibeWP one-time admin login
 * Description: Lets the VibeWP builder open wp-admin without handling a password.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

add_action( 'init', function () {
    if ( empty( $_GET['vibewp_login'] ) ) { return; }

    // Loopback only. This is a local development convenience and must never
    // authenticate a remote caller.
    $remote = isset( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '';
    if ( ! in_array( $remote, array( '127.0.0.1', '::1' ), true ) ) { return; }

    $presented = (string) $_GET['vibewp_login'];
    $expected  = get_transient( 'vibewp_login_token' );
    if ( ! $expected || ! hash_equals( (string) $expected, $presented ) ) { return; }

    // Single use.
    delete_transient( 'vibewp_login_token' );

    $user = get_user_by( 'login', 'vibewp' );
    if ( ! $user ) { return; }

    wp_set_current_user( $user->ID );
    wp_set_auth_cookie( $user->ID, false );
    wp_safe_redirect( admin_url() );
    exit;
} );
`;

  await writeFile(join(dir, "vibewp-autologin.php"), php, "utf8");
}

/**
 * Mints a one-time token and returns a URL that lands in wp-admin already
 * signed in. Returns null if the site cannot be reached.
 */
export async function createAdminLoginUrl(opts: {
  installPath: string;
  url: string;
}): Promise<string | null> {
  const { installPath, url } = opts;
  // Ensure the plugin exists even for installs provisioned before it did.
  await installAutoLoginPlugin(installPath);

  const token = randomBytes(24).toString("hex");
  try {
    await wp([
      "eval",
      `set_transient( 'vibewp_login_token', ${JSON.stringify(token)}, 60 );`,
      `--path=${installPath}`,
    ]);
  } catch {
    return null;
  }
  return `${url}/?vibewp_login=${token}`;
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

  // WordPress installs with "plain" permalinks (?page_id=N), which means a
  // second page is not reachable at /its-slug/ — the front page is served
  // instead. Every page but the homepage is effectively invisible without
  // this, so it is part of provisioning rather than a later nicety.
  await wp(["rewrite", "structure", "/%postname%/", `--path=${installPath}`]);
  await wp(["rewrite", "flush", `--path=${installPath}`]);

  // Only write credentials for an install we actually created — otherwise we
  // would overwrite the real password with one that was never set.
  if (!installed) {
    await writeFile(
      join(SITES_ROOT, `${smbId}.credentials.txt`),
      `url=${effectiveUrl}\nadmin_user=${adminUser}\nadmin_password=${adminPassword}\n`,
      "utf8",
    );
  }

  await installAutoLoginPlugin(installPath);

  // A site nobody can open is not provisioned, so start serving it here.
  await ensureSiteServing({ installPath, port: effectivePort });

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

export type WpPageContent = {
  postId: number;
  content: string;
  title: string;
  /** ISO-ish string from WordPress, for telling the user when it was touched. */
  modifiedAt: string | null;
};

/**
 * Reads a page's stored block markup back out of WordPress.
 *
 * The only path that reads content FROM WordPress. Until this existed, sync ran
 * one way and an edit made in wp-admin was destroyed by the next export.
 *
 * Returns null when the page does not exist there — a page created in VibeWP
 * but never exported is not an error.
 */
export async function readPageContent(opts: {
  installPath: string;
  slug: string;
  /** The home page is the front page, which may be stored under any slug. */
  asFrontPage?: boolean;
}): Promise<WpPageContent | null> {
  const { installPath, slug, asFrontPage } = opts;

  const script = `
    $slug = ${JSON.stringify(slug)};
    $front = ${asFrontPage ? "true" : "false"};

    $post = null;
    if ($front) {
      $id = (int) get_option("page_on_front");
      if ($id) { $post = get_post($id); }
    }
    if (!$post) { $post = get_page_by_path($slug, OBJECT, "page"); }
    if (!$post) { echo "null"; return; }

    echo json_encode([
      "postId"     => (int) $post->ID,
      "content"    => $post->post_content,
      "title"      => $post->post_title,
      "modifiedAt" => $post->post_modified_gmt,
    ]);
  `;

  try {
    const out = await wp(["eval", script, `--path=${installPath}`]);
    if (out.trim() === "null") return null;
    return JSON.parse(out) as WpPageContent;
  } catch (err) {
    console.warn("[wp] read failed for", slug, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Downloads an external image into the site's own media library and returns
 * its local URL.
 *
 * WHY NOT JUST HOTLINK: an exported site has to be genuinely the client's —
 * portable, and still working if it's moved to another host or if we stop
 * running. A hero <img> pointing at images.pexels.com is a silent dependency
 * on a third party we don't control. Sideloading makes the install
 * self-contained, and puts the photo in the media library where the client
 * can swap it from wp-admin like any other image.
 *
 * Re-export is idempotent: the source URL is recorded in attachment meta and
 * reused, so exporting ten times doesn't leave ten copies of the same photo.
 *
 * The stored file is re-encoded to WebP. We ask the CDN for WebP too, but that
 * can't be trusted to decide what lands on disk: the source URL still ends in
 * ".jpeg", and a file whose extension disagrees with its bytes causes trouble
 * later. Re-encoding through WordPress's own image editor guarantees the
 * extension, the mime type and the generated thumbnail sizes all agree.
 *
 * Returns null on any failure — the caller then falls back to the original
 * URL, which still renders.
 */
export type SideloadedImage = {
  url: string;
  /** Attachment id, so the exported block is a real media-library image. */
  id: number;
  width: number | null;
  height: number | null;
};

export async function sideloadImage(opts: {
  installPath: string;
  url: string;
  alt?: string;
}): Promise<SideloadedImage | null> {
  const { installPath, url, alt } = opts;

  // A descriptive filename is a small but free SEO win: "bride-holding-rose-
  // bouquet.webp" says more to a crawler than "pexels-photo-5060099.jpeg".
  const slug =
    (alt ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")
      .slice(0, 8)
      .join("-") || "hero-image";

  const script = `
    $src  = ${JSON.stringify(url)};
    $alt  = ${JSON.stringify(alt ?? "")};
    $slug = ${JSON.stringify(slug)};

    $describe = function ($id) {
      $meta = wp_get_attachment_metadata($id);
      echo json_encode([
        "url"    => wp_get_attachment_url($id),
        "id"     => (int) $id,
        "width"  => isset($meta["width"])  ? (int) $meta["width"]  : null,
        "height" => isset($meta["height"]) ? (int) $meta["height"] : null,
      ]);
    };

    // Already imported on a previous export? Reuse it.
    $found = get_posts([
      "post_type"      => "attachment",
      "posts_per_page" => 1,
      "fields"         => "ids",
      "meta_key"       => "_vibewp_source_url",
      "meta_value"     => $src,
    ]);
    if (!empty($found)) { $describe($found[0]); return; }

    // These live in the admin includes, which WP-CLI's eval context does not
    // load for us.
    require_once ABSPATH . "wp-admin/includes/media.php";
    require_once ABSPATH . "wp-admin/includes/file.php";
    require_once ABSPATH . "wp-admin/includes/image.php";

    $tmp = download_url($src);
    if (is_wp_error($tmp)) { WP_CLI::error($tmp->get_error_message()); }

    $name = "";
    $mime = function_exists("mime_content_type") ? mime_content_type($tmp) : "";

    if ($mime === "image/webp") {
      // Already WebP — do NOT re-encode. Measured on one photo: the CDN's own
      // WebP was 70,658 bytes and re-encoding it produced 78,010, because a
      // lossy->lossy round trip both loses quality and, at WordPress's default
      // quality, costs size. Just claim the correct filename and move on.
      // (The source URL still ends ".jpeg" despite serving WebP bytes, which is
      // exactly why the extension has to come from the bytes, not the URL.)
      $name = $slug . ".webp";
    } elseif (wp_image_editor_supports(["mime_type" => "image/webp"])) {
      // Not WebP — convert. This is the path a client upload or a
      // non-converting CDN takes.
      $editor = wp_get_image_editor($tmp);
      if (!is_wp_error($editor)) {
        $target = trailingslashit(dirname($tmp)) . $slug . ".webp";
        $saved  = $editor->save($target, "image/webp");
        if (!is_wp_error($saved)) {
          @unlink($tmp);
          $tmp  = $saved["path"];
          $name = basename($saved["path"]);
        }
      }
    }

    // Conversion unavailable or failed: keep the original bytes rather than
    // failing the export — a JPEG hero beats no hero.
    if ($name === "") {
      $ext  = pathinfo(parse_url($src, PHP_URL_PATH), PATHINFO_EXTENSION);
      $name = $slug . "." . ($ext ? $ext : "jpg");
    }

    $id = media_handle_sideload(["name" => $name, "tmp_name" => $tmp], 0, $alt);
    if (is_wp_error($id)) { @unlink($tmp); WP_CLI::error($id->get_error_message()); }

    update_post_meta($id, "_vibewp_source_url", $src);
    // media_handle_sideload()'s description becomes the title, NOT the alt.
    // Alt text is mandatory, so it is set explicitly here.
    update_post_meta($id, "_wp_attachment_image_alt", $alt);

    $describe($id);
  `;

  try {
    const out = await wp(["eval", script, `--path=${installPath}`]);
    const parsed = JSON.parse(out) as SideloadedImage;
    return parsed.url?.startsWith("http") ? parsed : null;
  } catch (err) {
    console.warn("[wp] sideload failed for", url, err instanceof Error ? err.message : err);
    return null;
  }
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
