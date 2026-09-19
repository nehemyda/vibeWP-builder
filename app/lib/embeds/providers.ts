/**
 * What a Vibe site may embed, and how a pasted URL becomes embeddable.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY AN ALLOWLIST AND NOT ARBITRARY EMBED CODE
 *
 * A WordPress plugin cannot run on a Vibe site — it is PHP inside WordPress,
 * and there is no WordPress. The nearest honest equivalent is a third party's
 * own embed, which is a URL rather than code.
 *
 * It is deliberately not a paste-your-own-script field. That would run
 * anything a client liked on a page WE serve, from our infrastructure, under a
 * subdomain of ours — and nothing sets a Content-Security-Policy on a Vibe
 * page, so a pasted script would simply execute. It is also the direction that
 * cannot be undone: widening an allowlist later is easy, withdrawing arbitrary
 * script from clients who already have it is not.
 *
 * The cost is real and belongs on the screen rather than in a surprise: a
 * provider that is not here cannot be embedded, and adding one is a change to
 * this file.
 *
 * WHY EACH PROVIDER REWRITES THE URL
 *
 * A client pastes the page they are looking at, because that is the URL they
 * have. Nobody hunts for the embed form of it. youtube.com/watch?v=X has to
 * become an /embed/ URL or the iframe shows a consent page and a broken
 * player, so the rewriting is not a nicety — it is the difference between the
 * feature working and it appearing to.
 * ─────────────────────────────────────────────────────────────────────
 */

export type EmbedProvider = {
  key: string;
  name: string;
  /**
   * The hosts this provider owns.
   *
   * Checked, not guessed. Matching on a substring would accept
   * "calendly.evil.com"; this compares the host exactly or as a subdomain.
   */
  hosts: string[];
  /** The pasted URL to the src worth framing, or null when it is not one. */
  toEmbedSrc(url: URL): string | null;
  /**
   * Why a URL on the right host still can't be framed, when there is something
   * more useful to say than "it can't".
   *
   * Exists because the commonest failure is a link the provider itself handed
   * the client — a Maps share link — and "that can't be embedded" gives them
   * nowhere to go. Optional: most refusals are self-explanatory.
   */
  whyNot?(url: URL): string | undefined;
  /** Some embeds cannot size themselves, so the section carries a height. */
  defaultHeight: number;
  /** What to paste, in the provider's own terms. */
  hint: string;
};

/** Exact host, or a subdomain of it. Never a substring. */
function hostMatches(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

export const EMBED_PROVIDERS: EmbedProvider[] = [
  {
    key: "youtube",
    name: "YouTube",
    hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    defaultHeight: 480,
    hint: "Paste the video's address — the one in the browser bar works.",
    toEmbedSrc(url) {
      /* Three shapes reach the same place: a watch page, a share link, and an
         embed URL somebody already found. */
      const id =
        url.hostname.replace(/^www\./, "") === "youtu.be"
          ? url.pathname.slice(1)
          : url.pathname.startsWith("/embed/")
            ? url.pathname.slice("/embed/".length)
            : (url.searchParams.get("v") ?? "");

      /* A video id is a fixed alphabet. Anything else is a channel page or a
         search result, which cannot be framed as a video. */
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;

      /* nocookie, because a client's visitors should not be tracked by a
         video the client only wanted to show. */
      return `https://www.youtube-nocookie.com/embed/${id}`;
    },
  },
  {
    key: "google-maps",
    name: "Google Maps",
    hosts: ["google.com", "google.co.uk", "maps.app.goo.gl", "goo.gl"],
    defaultHeight: 420,
    hint:
      "Open the place on Google Maps and copy the address from your browser bar " +
      "(it starts google.com/maps). A Share link can't be embedded.",
    toEmbedSrc(url) {
      /* An embed URL pasted by someone who found it already. */
      if (url.pathname.startsWith("/maps/embed")) return url.toString();

      /*
       * Only /maps. Without this, google.com is on the allowlist for the WHOLE
       * host — and a search page, which also carries ?q=, would quietly render
       * as a map of whatever was searched for.
       */
      if (!url.pathname.startsWith("/maps")) return null;

      /*
       * A shared Maps URL carries the place in its path, and a panned map
       * carries coordinates instead. The keyless /maps embed takes a query and
       * resolves either to the same pin.
       */
      const place = decodeURIComponent(
        url.pathname.split("/place/")[1]?.split("/")[0] ?? "",
      ).replace(/\+/g, " ");

      const at = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);

      const query = place || url.searchParams.get("q") || (at ? `${at[1]},${at[2]}` : "");
      if (!query) return null;

      return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
    },
    whyNot(url) {
      /* Short links are the thing Google's own Share button produces, so this
         is the refusal a client is most likely to hit. It cannot be followed
         without a network round trip, and a validator that makes outbound
         requests is a different and worse thing. */
      if (/(^|\.)goo\.gl$/.test(url.hostname.toLowerCase())) {
        return (
          "That's a Maps share link, which can't be embedded. Open the place on " +
          "Google Maps and copy the address from your browser bar instead."
        );
      }
      if (!url.pathname.startsWith("/maps")) {
        return "That's a Google link, but not a map. The address should start google.com/maps.";
      }
      return undefined;
    },
  },
  {
    key: "calendly",
    name: "Calendly",
    hosts: ["calendly.com"],
    defaultHeight: 660,
    hint: "Paste your booking page link, e.g. calendly.com/your-name/30min.",
    toEmbedSrc(url) {
      /* Calendly frames its own booking pages directly; the only thing worth
         stripping is the tracking a share link carries. */
      if (url.pathname === "/" || url.pathname === "") return null;
      /* Calendly's own dashboard lives on the same host and is not a booking
         page — framing it would show a stranger a sign-in screen. */
      if (url.pathname.startsWith("/app/") || url.pathname.startsWith("/event_types")) return null;
      return `https://calendly.com${url.pathname}?hide_gdpr_banner=1`;
    },
    whyNot(url) {
      if (url.pathname.startsWith("/app/") || url.pathname.startsWith("/event_types")) {
        return "That's your Calendly dashboard. Visitors need the public booking link instead.";
      }
      if (url.pathname === "/" || url.pathname === "") {
        return "That's Calendly's home page, not your booking page.";
      }
      return undefined;
    },
  },
];

/**
 * What to call a provider in front of a client.
 *
 * The canvas placeholder names the embed it is standing in for, and the stored
 * prop is a key — "google-maps". Showing that to someone who chose "Google
 * Maps" from a menu is showing them our database.
 */
export function embedProviderName(key: string | undefined): string {
  return EMBED_PROVIDERS.find((p) => p.key === key)?.name ?? "Embed";
}

export function providerByKey(key: string | undefined): EmbedProvider | undefined {
  return EMBED_PROVIDERS.find((p) => p.key === key);
}

export type EmbedResolution =
  | { ok: true; src: string; provider: EmbedProvider }
  | { ok: false; reason: string };

/**
 * The src to frame for a pasted URL, or why there isn't one.
 *
 * The provider is chosen by the client and the URL is checked against THAT
 * choice rather than sniffed: guessing means a typo silently becomes a
 * different provider, and a look-alike host is exactly the typo worth
 * catching.
 */
export function resolveEmbed(providerKey: string | undefined, raw: string | undefined): EmbedResolution {
  const provider = providerByKey(providerKey);
  if (!provider) return { ok: false, reason: "Choose where the embed comes from." };
  if (!raw?.trim()) return { ok: false, reason: "Paste the link to embed." };

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That doesn't look like a web address." };
  }

  /* http and https only. A javascript: or data: URL is not a page to frame,
     and this is the boundary where that has to be refused. */
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only web addresses can be embedded." };
  }

  if (!hostMatches(url.hostname, provider.hosts)) {
    return { ok: false, reason: `That isn't a ${provider.name} link.` };
  }

  const src = provider.toEmbedSrc(url);
  if (!src) {
    return {
      ok: false,
      reason: provider.whyNot?.(url) ?? `That ${provider.name} link can't be embedded.`,
    };
  }

  return { ok: true, src, provider };
}
