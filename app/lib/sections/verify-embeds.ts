/**
 * The embed allowlist, asserted.
 *
 * Run with `npx tsx lib/sections/verify-embeds.ts`, and as part of
 * `npm run verify`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A GATE AND NOT A COMMENT
 *
 * Two things here fail silently if they regress. A URL that stops being
 * rewritten still renders — as a consent page or a broken player — and looks
 * like the provider's fault. And a host check loosened to a substring would
 * accept calendly.evil.com while every legitimate URL kept working, so
 * nothing would look wrong until it mattered.
 *
 * Both are one-line mistakes that no other gate would notice.
 * ─────────────────────────────────────────────────────────────────────
 */
import { resolveEmbed, EMBED_PROVIDERS } from "@/lib/embeds/providers";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

console.log(`== ${EMBED_PROVIDERS.length} embed providers ==`);

/** Different shapes of the same thing must reach one src. */
const CONVERGE: Array<[string, string[]]> = [
  [
    "youtube",
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
    ],
  ],
];

for (const [provider, urls] of CONVERGE) {
  const srcs = urls.map((u) => {
    const r = resolveEmbed(provider, u);
    return r.ok ? r.src : `REFUSED(${r.reason})`;
  });
  if (new Set(srcs).size !== 1) {
    fail(`${provider}: these should reach one src — ${JSON.stringify(srcs)}`);
  } else {
    console.log(`  ok   ${provider}: ${urls.length} URL shapes converge on ${srcs[0]}`);
  }
}

/** Must be refused, each for a different reason. */
const REFUSE: Array<[string, string, string]> = [
  ["youtube", "https://youtube.evil.com/watch?v=dQw4w9WgXcQ", "look-alike host"],
  ["youtube", "https://www.youtube.com.evil.com/watch?v=x", "host as a prefix"],
  ["calendly", "https://calendly.com.attacker.net/jane/30min", "host as a prefix"],
  ["youtube", "javascript:alert(1)", "hostile scheme"],
  ["youtube", "data:text/html,<script>alert(1)</script>", "data URL"],
  ["youtube", "https://www.youtube.com/@channel", "not a video"],
  ["calendly", "https://calendly.com/", "no booking path"],
  ["calendly", "https://calendly.com/app/scheduled_events/user/me", "the Calendly dashboard"],
  ["google-maps", "https://www.google.com/search?q=cafe", "a search, not a map"],
  ["google-maps", "https://mail.google.com/mail/u/0/?q=invoice", "gmail on the same host"],
  ["google-maps", "https://maps.app.goo.gl/AbCdEf123", "a Maps share link"],
  ["", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "no provider chosen"],
  ["youtube", "", "no link"],
];

for (const [provider, url, why] of REFUSE) {
  const r = resolveEmbed(provider, url);
  if (r.ok) fail(`${why}: accepted ${JSON.stringify(url)} as ${r.src}`);
  else console.log(`  ok   refused ${why.padEnd(20)} ${r.reason}`);
}

/** Shapes a client really does paste, which must work. */
const ACCEPT: Array<[string, string, string]> = [
  ["google-maps", "https://www.google.com/maps/place/Big+Ben/@51.5,-0.12,17z", "a place URL"],
  ["google-maps", "https://www.google.com/maps/@51.5007,-0.1246,17z", "a panned map"],
  ["google-maps", "https://www.google.com/maps?q=SW1A+1AA", "a map query"],
  ["google-maps", "https://www.google.com/maps/embed?pb=!1m18!2m3", "an embed URL already"],
  ["calendly", "https://calendly.com/jane/30min?month=2026-09", "a booking page"],
];

for (const [provider, url, what] of ACCEPT) {
  const r = resolveEmbed(provider, url);
  if (!r.ok) fail(`${what}: refused ${JSON.stringify(url)} — ${r.reason}`);
  else console.log(`  ok   ${what.padEnd(24)} ${r.src}`);
}

/** A refusal nobody can act on is a bug with a polite face. */
for (const [provider, url, why] of REFUSE) {
  const r = resolveEmbed(provider, url);
  if (!r.ok && !/[.!]$/.test(r.reason)) fail(`${why}: reason isn't a sentence — ${r.reason}`);
}

/** Every provider's own hint and hosts have to be present, or the field lies. */
for (const p of EMBED_PROVIDERS) {
  if (!p.hosts.length) fail(`${p.key}: no hosts, so nothing can ever match`);
  if (!p.hint.trim()) fail(`${p.key}: no hint, so nobody knows what to paste`);
}

console.log(fails === 0 ? "\nALL EMBED GATES PASS" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
