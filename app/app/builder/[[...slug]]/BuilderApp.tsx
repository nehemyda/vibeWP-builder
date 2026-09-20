"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./builder.module.css";
import { generatePageAction, type ChromeNode } from "@/app/actions/ai-generate";
import {
  exportToWordPressAction,
  publishSiteAction,
  openWordPressAdminAction,
} from "@/app/actions/wordpress";
import {
  savePageSchemaAction,
  listPagesAction,
  undoPageAction,
  redoPageAction,
  getHistoryStateAction,
  type PageSummary,
  type HistoryState,
} from "@/app/actions/pages";
import { detectIntent } from "@/lib/page-intent";
import type { SiteMode } from "@/lib/db/schema";
import { type DesignTokens } from "@/lib/design/tokens";
import { composePageBody } from "@/lib/render/page-document";
import { getSectionByKey, getSectionByNodeType } from "@/lib/sections";
import {
  applyCanvasOpAction,
  applyCanvasPasteAction,
  type CanvasOp,
  type CanvasPasteOp,
  type EditResult,
} from "@/app/actions/edit";
import { readClip, writeClip, type Clip } from "@/lib/design/clipboard";
import { setSectionImageAction } from "@/app/actions/edit";
import { MediaPanel } from "./MediaPanel";
import { SiteDashboard, type DashboardTab } from "./SiteDashboard";
import { SeoPanel } from "./SeoPanel";
import { ImagesTab } from "./ImagesTab";
import { SCREENS, fieldFor as hideField } from "@/lib/design/part-visibility";
import { widthFieldFor } from "@/lib/design/part-size";
import { PART_ORDER_FIELD } from "@/lib/design/part-order";
import {
  withPreviewPlaceholders,
} from "@/lib/wp/serialize";
import { PreviewFrame, type CanvasSelection, type SectionBox } from "./PreviewFrame";
import { CanvasOverlay } from "./CanvasOverlay";
import { Composer, WorkingCover } from "./Composer";
import { DesignPanel, type CatalogueEntry } from "./DesignPanel";
import { StylePanel } from "./StylePanel";
import { saveDesignTokensAction } from "@/app/actions/design";
import { SECTION_STYLE_OPTIONS, sectionOwnOptions } from "@/lib/design/section-style";
import { ELEMENT_ROLES } from "@/lib/design/element-style";
import { WordPressLockNotice } from "./WordPressLockNotice";
import { SiteDetailsDrawer, type SiteDetails } from "./SiteDetailsDrawer";
import type { WpEditLock } from "@/lib/wp/local-driver";
import type { FormPreviewField } from "@/lib/wp/serialize";
import { IntakeForm } from "./IntakeForm";
import { loadIntakeAction, type IntakeData } from "@/app/actions/intake";
import { applyEditAction } from "@/app/actions/edit";
import { SyncBanner } from "./SyncBanner";
import {
  detectSyncAction,
  detectEditLocksAction,
  pullFromWordPressAction,
  resolveConflictAction,
  type PageSyncReport,
} from "@/app/actions/sync";
import {
  appendBuilderMessageAction,
  clearBuilderMessagesAction,
  type StoredMessage,
} from "@/app/actions/builder-chat";

type ChatMessage = {
  id: string;
  role: "user" | "ai";
  text: string;
  steps: string[];
};

/**
 * Shown while the model is working, then REPLACED by the real list of sections
 * that were built.
 *
 * These used to be the only steps, and they claimed "Selected section:
 * HeroSplit" — accurate at the time, since a hero was all generation could
 * produce, but it read as a report on a page that had been considered rather
 * than a hardcoded constant. They now describe the phase in progress and make
 * no claim about the outcome; the outcome comes back from the server.
 */
const PLANNING_STEPS = [
  "Reading your business details",
  "Planning the page",
  "Writing the copy",
];

/**
 * A message id that cannot collide with one already on screen.
 *
 * This was a module-level counter, which React reported as "two children with
 * the same key, m_3". The counter lives in the module and the messages live in
 * component state, so anything that re-evaluates the module without discarding
 * the state — Fast Refresh during development, most obviously — restarts it at
 * zero while m_1, m_2, m_3 are still rendered. The next three messages collide.
 *
 * Randomness rather than a bigger counter, because the fault is the assumption
 * that a counter and the list it numbers share a lifetime. They do not.
 */
function nextId() {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `m_${rand}`;
}

/* Inline so they inherit currentColor and need no icon dependency. */
const PinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z" strokeLinejoin="round" />
    <path d="M12 14v6" strokeLinecap="round" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
  </svg>
);

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5Z" />
  </svg>
);

/* Curved arrow doubling back on itself — the conventional undo/redo glyph. */
const UndoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M9 7H15a5 5 0 0 1 0 10h-5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 4L9 7l3 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RedoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M15 7H9a5 5 0 0 0 0 10h5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 4l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/*
 * Viewport and reload icons.
 *
 * Drawn rather than typed. These were emoji — 🖥 ▭ 📱 — which render as a
 * different glyph on every platform, ignore stroke weight, refuse to take the
 * active colour, and in the toolbar came out as barely-visible grey shapes at
 * three different optical sizes. An inline SVG inherits currentColor and sits
 * on the same 24px grid as the undo, redo and pin icons beside it, so the row
 * finally reads as one set.
 */
const HamburgerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
  </svg>
);

const DesktopIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="2.5" y="4" width="19" height="12.5" rx="1.8" />
    <path d="M9 20h6M12 16.5V20" strokeLinecap="round" />
  </svg>
);

const TabletIcon = () => (
  /*
   * Nearly square, and wider than the phone by a clear margin. At 18px a 14-wide
   * tablet beside a 10-wide phone were the same shape to the eye — the row read
   * as one icon repeated. Silhouette is the only thing legible at this size.
   */
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3" y="3.5" width="18" height="17" rx="2.2" />
    <path d="M10.5 17.4h3" strokeLinecap="round" />
  </svg>
);

const MobileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="8" y="2" width="8" height="20" rx="2.2" />
    <path d="M11 19.2h2" strokeLinecap="round" />
  </svg>
);

/* Circular arrow: a full arc with a gap, plus the head on the open end. */
const ReloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.4-5.7" strokeLinecap="round" />
    <path d="M20 4.5V10h-5.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function BuilderApp({
  catalogue,
  initialDesignTokens,
  siteId,
  smbId,
  initialPages,
  initialPanel,
  initialMessages,
  initialWpUrl,
  initialHistory,
  builderPath,
  backPath,
  backLabel,
  siteName,
  mode,
  vibeUrl,
  initialSchema,
  initialChrome,
  initialIntake,
  previewFacts,
  formsByToken,
  siteDetails,
  prompt,
  autostart,
}: {
  /**
   * The designs this site may use, resolved on the server.
   *
   * Policy only — which sections are switched on, what the admin renamed them
   * to, which plans may use them. The structure comes from the registry, which
   * the client already imports for the canvas.
   */
  catalogue: CatalogueEntry[];
  /** The site's hand-set design values, or {} when it is all as designed. */
  initialDesignTokens: DesignTokens;
  siteId: string;
  smbId: string;
  initialPages: PageSummary[];
  /** ?panel=, read by the server so hydration cannot disagree about it. */
  initialPanel?: string;
  initialMessages: StoredMessage[];
  initialWpUrl: string | null;
  /** Undo/redo depth for the page shown on load, so the buttons are correct immediately. */
  initialHistory: HistoryState;
  builderPath: string;
  backPath: string;
  backLabel: string;
  siteName: string;
  /**
   * Vibe, or Vibe WordPress.
   *
   * Decides whether this builder has a WordPress half at all: the export and
   * wp-admin controls, the sync banner, the edit-lock cover and the two timers
   * behind them are all meaningless for a site we host ourselves.
   */
  mode: SiteMode;
  /** Where a published Vibe site is being served, or null if it isn't yet. */
  vibeUrl: string | null;
  /** The stored schema for the page shown on load, so the canvas paints every section. */
  initialSchema: Record<string, unknown> | null;
  /** The site's header and footer, so the canvas frames the page as the live site does. */
  initialChrome: { header: ChromeNode | null; footer: ChromeNode | null };
  /** Prefilled intake, and whether it has ever been submitted. */
  initialIntake: { data: IntakeData; completed: boolean };
  /** phone/email/address/hours, for resolving tokens in the canvas. */
  previewFacts: Record<string, string>;
  /**
   * Every form on the site, keyed by embed token.
   *
   * Keyed rather than singular because the canvas switches pages on its own,
   * and which form a page shows is decided by the token in its own FormEmbed
   * node — not by which form happens to be first.
   */
  formsByToken: Record<string, { fields: FormPreviewField[]; style: Record<string, string> }>;
  /** Everything the site-details drawer shows. */
  siteDetails: SiteDetails;
  prompt: string | null;
  autostart: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (autostart && prompt) return []; // populated by the autostart effect below
    // A stored transcript wins: the conversation is the record of how this
    // site got built, and losing it on every reload made the chat feel amnesiac.
    if (initialMessages.length > 0) return initialMessages;
    if (!initialSchema) {
      return [
        {
          id: nextId(),
          role: "ai",
          text: "Describe the business this site is for, and I'll put together a starting homepage.",
          steps: [],
        },
      ];
    }
    return [];
  });
  /**
   * The full schema for the page on screen — what the canvas renders.
   *
   * This replaced a `content: HeroContent` state. The canvas rendered
   * heroContentToSchema(content), rebuilding a one-node schema from an
   * extracted hero, so a page of six sections would have shown its first one
   * and silently hidden the rest.
   */
  const [schema, setSchema] = useState<Record<string, unknown> | null>(initialSchema);
  /*
   * The site's header and footer. Site-wide rather than per page, so switching
   * pages leaves them alone — which is the whole point of a template part.
   */
  const [chrome, setChrome] = useState(initialChrome);
  /*
   * Seeded from the server, then kept current by chat.
   *
   * As a bare prop it never changed after a form edit: the field was saved and
   * the canvas kept drawing the old questions, so the reply and the screen
   * disagreed about what had just happened.
   */
  const [forms, setForms] = useState(formsByToken);

  /* Which form THIS page shows, read from the page on screen. */
  const activeFormToken = ((schema?.nodes ?? []) as { type?: string; props?: { formToken?: string } }[])
    .find((n) => n.type === "FormEmbed")?.props?.formToken;
  const activeForm = activeFormToken ? forms[activeFormToken] : undefined;
  const [intake, setIntake] = useState(initialIntake);
  /*
   * Open on a first build, closed afterwards.
   *
   * A repeat visit goes straight to the builder: someone who came back to
   * reword one heading should not be walked through a form to reach it. The
   * toolbar's "Business details" button reopens it when they do want it.
   */
  const [intakeOpen, setIntakeOpen] = useState(!initialIntake.completed);
  /** A website chat asked us to read; handed to the intake form when it opens. */
  const [intakeImportUrl, setIntakeImportUrl] = useState<string | null>(null);
  /** Resolved phone/email/address/hours for the {{token}}s in the canvas. */
  const [facts, setFacts] = useState(previewFacts);
  const [generating, setGenerating] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [chatOpen, setChatOpen] = useState(true);
  /** Off by default: docked as a second column. Pinning floats it over the preview. */
  const [pinned, setPinned] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"export" | "publish" | "wpadmin" | null>(null);
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const siteMenuRef = useRef<HTMLDivElement>(null);
  /*
   * Bumped to remount the preview iframe.
   *
   * A reload has to rebuild the document, not just re-render: the frame holds
   * its own scroll position, its own <details> open states and any images that
   * failed to load, none of which a prop change clears.
   */
  const [reloadKey, setReloadKey] = useState(0);

  /* ---- canvas selection ---- */
  /**
   * The page's nodes, typed.
   *
   * `schema` is held as a loose record because it arrives as a server prop and
   * is written back as jsonb; the canvas needs to read a node's type and props,
   * so the narrowing happens once here rather than at each use.
   */
  const nodes = (schema?.nodes ?? []) as Array<{
    type?: string;
    props?: Record<string, unknown>;
  }>;

  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [boxes, setBoxes] = useState<SectionBox[]>([]);
  const [designFor, setDesignFor] = useState<CanvasSelection | null>(null);
  /*
   * The design each section had when its panel was opened, so "back to how it
   * was" survives trying five in a row. Session-only and per section: the
   * durable route back is the revision history, which every swap writes to.
   */
  const [swapOrigin, setSwapOrigin] = useState<Record<string, string>>({});
  /*
   * What the canvas is doing right now, or null.
   *
   * A sentence rather than a boolean because the cover repeats it: a swap that
   * has to write new copy takes about five seconds, and a page that simply sits
   * there for five seconds after a click reads as a click that did not land.
   */
  const [canvasBusy, setCanvasBusy] = useState<string | null>(null);

  /* ---- hand-set design values ---- */
  const [designTokens, setDesignTokens] = useState<DesignTokens>(initialDesignTokens);
  /*
   * Which section is being EDITED, as opposed to merely selected.
   *
   * Selecting a section used to make every string in it typeable at once, so
   * there was no way to just point at one: clicking to move or duplicate a
   * section dropped a caret into whatever word was under the cursor. Editing
   * is a mode now, entered from the section bar, and nothing is editable
   * until it is on.
   */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  /*
   * Which photograph the library is filling. Null with the panel open means
   * it was opened on its own, to upload and tidy up rather than to choose.
   */
  const [mediaTarget, setMediaTarget] = useState<{
    index: number;
    path: string;
    label: string;
  } | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  /*
   * Which parts the selected section actually rendered, reported by the
   * canvas. Read from the page rather than from a registry of which section
   * owns an eyebrow: the markup is the truth about what is there, and a
   * second description of it would drift the first time a design changed.
   */
  const [renderedParts, setRenderedParts] = useState<string[]>([]);
  /*
   * The dashboard tab, or null when it is closed.
   *
   * Seeded from the SERVER's reading of ?panel=, so it survives a reload and
   * can be opened by link. Read from window.location instead and the server
   * renders no active tab while the client renders one, which fails hydration
   * on the top bar's classes.
   */
  const [dashTab, setDashTab] = useState<DashboardTab | null>(() =>
    initialPanel === "style" || initialPanel === "images" || initialPanel === "seo"
      ? initialPanel
      : null,
  );

  /*
   * Kept in the URL without a navigation. replaceState rather than the router,
   * because a route change would re-render the tree and rebuild the canvas —
   * the dashboard's whole promise is that the page underneath is untouched.
   */
  /*
   * Committing the site's design tokens.
   *
   * Shared, because the same sliders now appear in two places — the dashboard
   * and the section panel's site-wide view — and two copies of "save then
   * trust what came back" is one copy too many.
   */
  const commitTokens = (next: DesignTokens) => {
    setDesignTokens(next);
    void saveDesignTokensAction({ siteId, tokens: next }).then((result) => {
      // The server sanitises, so what it returns is the truth about what was
      // stored — including a value it refused.
      if (result.ok) setDesignTokens(result.tokens);
    });
  };

  const openDash = (tab: DashboardTab | null) => {
    setDashTab(tab);
    /*
     * No typeof window guard: this only ever runs from a click, and a needless
     * one here would suggest the render-time version of the same branch is
     * acceptable. It is not — that is what broke hydration.
     */
    const url = new URL(window.location.href);
    if (tab) url.searchParams.set("panel", tab);
    else url.searchParams.delete("panel");
    window.history.replaceState(null, "", url);
  };
  const [styleOpen, setStyleOpen] = useState(false);
  /** Which section the style panel is showing, or null for the whole site. */
  const [styleFor, setStyleFor] = useState<CanvasSelection | null>(null);
  /** Whether chat was open before the style panel took its place. */
  const chatWasOpen = useRef(true);
  /** Seeded from the server so an already-exported site shows its links on load. */
  const [wpUrl, setWpUrl] = useState<string | null>(initialWpUrl);
  const [pages, setPages] = useState<PageSummary[]>(initialPages);
  /** Which page generation writes to. Everything used to assume "home". */
  const [activeSlug, setActiveSlug] = useState("home");
  /**
   * Server-reported history depth for the active page, so Undo/Redo are
   * disabled when they'd fail. Never inferred locally: history lives per page
   * in the database, and two tabs on one site share it.
   */
  const [history, setHistory] = useState<HistoryState>(initialHistory);
  const [stepping, setStepping] = useState(false);
  /** WordPress-vs-VibeWP comparison, loaded after paint. Null until it returns. */
  const [syncReport, setSyncReport] = useState<PageSyncReport[] | null>(null);
  const [syncBusy, setSyncBusy] = useState<string | null>(null);
  const [syncDismissed, setSyncDismissed] = useState(false);
  /** Anyone currently in the WordPress editor for this site. */
  const [locks, setLocks] = useState<WpEditLock[]>([]);
  /*
   * Set when the client chooses to work through a lock.
   *
   * Deliberately NOT persisted: it lasts for this visit only, so an
   * override made once because our reading was wrong does not quietly
   * disable the protection for every future session.
   */
  const [lockOverridden, setLockOverridden] = useState(false);
  const ran = useRef(false);
  const syncRan = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  /** Re-reads the WordPress comparison. */
  const refreshSync = useCallback(async () => {
    if (mode === "vibe") return; // Nothing to reconcile with.
    try {
      const result = await detectSyncAction(smbId);
      if (result.ok) setSyncReport(result.pages);
    } catch {
      // Detection is advisory; a failure must not stop someone editing.
    }
  }, [smbId, mode]);

  /*
   * Detect on open, as the chosen sync model requires.
   *
   * Deliberately client-side after paint rather than in the server component:
   * detection shells out to WP-CLI and may have to wake a sleeping local PHP
   * server, which would add seconds to every builder page load. The banner
   * appearing a moment late is much better than the whole screen waiting.
   *
   * The ref guard keeps this to one run for the lifetime of the component;
   * state is set from the async callback, never synchronously here.
   */
  useEffect(() => {
    if (syncRan.current) return;
    syncRan.current = true;
    void refreshSync();
  }, [refreshSync]);

  /*
   * Watch WordPress for someone editing the same site.
   *
   * ─────────────────────────────────────────────────────────────────────
   * WHY A POLL AND NOT A ONE-OFF CHECK
   *
   * Everything above this used to run exactly once per page load, which is why
   * a change made in WordPress showed up in VibeWP "very late": nothing was
   * looking. It was not slow, it had stopped checking. A lock is worth even
   * less as a one-off — it exists precisely to appear while you are already
   * sitting in the builder.
   */
  const hadLockRef = useRef(false);

  const checkLocks = useCallback(async () => {
    try {
      const result = await detectEditLocksAction(smbId);

      /*
       * FAIL OPEN.
       *
       * This used to `return` when a check failed, leaving whatever locks were
       * last seen on screen — so a single WP-CLI hiccup while locked would have
       * held the builder shut permanently, with no way back but a reload. A
       * check that cannot reach WordPress has learned nothing about whether
       * anyone is editing, and "nothing" must not read as "still locked".
       */
      if (!result.ok) {
        setLocks([]);
        return;
      }
      setLocks(result.locks);

      /*
       * The moment the last lock clears, re-run the expensive comparison.
       * Someone has just finished editing in WordPress, so this is exactly
       * when VibeWP is most likely to be out of date — and waiting for the
       * client to reload to find that out is the behaviour being fixed.
       */
      if (hadLockRef.current && result.locks.length === 0) void refreshSync();
      hadLockRef.current = result.locks.length > 0;

      /*
       * An override lasts for the lock that prompted it, not for the visit.
       * Once WordPress is clear again the protection arms itself, so someone
       * who worked through a stuck cover this morning is still warned when a
       * colleague genuinely opens the editor this afternoon.
       */
      if (result.locks.length === 0) setLockOverridden(false);
    } catch {
      setLocks([]);
    }
  }, [smbId, refreshSync]);

  /*
   * Polled faster while locked than while free.
   *
   * WordPress does not delete a lock when someone leaves the editor, it lets it
   * EXPIRE — the meta sits there until it is 150 seconds old. So the wait after
   * a colleague closes their tab is mostly WordPress's window, and any polling
   * gap of ours is added on top of it. Checking every five seconds while the
   * cover is up keeps us from adding a further twenty to a wait that is already
   * long enough to feel broken; twenty is plenty when nothing is happening.
   */
  const locked = locks.length > 0;
  useEffect(() => {
    /* No WordPress, no editor, no lock. The action short-circuits for a Vibe
       site anyway; not starting the timer is what stops a round trip every
       twenty seconds for an answer that cannot change. */
    if (mode === "vibe") return;
    void checkLocks();
    const timer = setInterval(() => void checkLocks(), locked ? 5_000 : 20_000);
    return () => clearInterval(timer);
  }, [checkLocks, locked, mode]);

  // Closes the site menu on any click elsewhere, the behaviour every menu has.
  useEffect(() => {
    if (!siteMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (siteMenuRef.current && !siteMenuRef.current.contains(e.target as Node)) {
        setSiteMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [siteMenuOpen]);

  async function onPull(slug: string) {
    setSyncBusy(slug);
    try {
      const result = await pullFromWordPressAction({ smbId, slug });
      if (result.ok) {
        say(`Pulled the WordPress version of "${slug}" into VibeWP.`);
        const refreshed = await listPagesAction(siteId);
        setPages(refreshed);
        paintFrom(refreshed, activeSlug);
        await refreshHistory(activeSlug);
      } else {
        say(result.error);
      }
      await refreshSync();
    } finally {
      setSyncBusy(null);
    }
  }

  async function onResolve(slug: string, keep: "wordpress" | "vibewp") {
    setSyncBusy(slug);
    try {
      const result = await resolveConflictAction({ smbId, slug, keep });
      if (!result.ok) {
        say(result.error);
      } else if (keep === "wordpress") {
        say(`Kept the WordPress version of "${slug}".`);
        const refreshed = await listPagesAction(siteId);
        setPages(refreshed);
        paintFrom(refreshed, activeSlug);
        await refreshHistory(activeSlug);
      } else {
        say(`Kept the VibeWP version of "${slug}". Export to push it to WordPress.`);
      }
      await refreshSync();
    } finally {
      setSyncBusy(null);
    }
  }

  /**
   * Re-reads history depth. Called from event handlers — page switch, after a
   * write, after a step — never from an effect: the initial value arrives as a
   * prop from the server, which is how every other server-known value here
   * (initialPages, initialWpUrl) is seeded.
   */
  const refreshHistory = useCallback(
    async (slug: string) => {
      try {
        setHistory(await getHistoryStateAction({ siteId, slug }));
      } catch {
        // A failed count must not break editing — leave the buttons as they were.
      }
    },
    [siteId],
  );

  /** Shared by both toolbar buttons and the chat "undo" keyword. */
  async function stepHistoryBy(direction: "undo" | "redo") {
    if (stepping) return;
    setStepping(true);
    try {
      const act = direction === "undo" ? undoPageAction : redoPageAction;
      const result = await act({ siteId, slug: activeSlug });
      if (result.ok) {
        setHistory(result.state);
        /*
         * Re-read the content and repaint from local state. router.refresh()
         * alone is NOT enough and used to be all this did: `content` is
         * useState(initialSchema), so a new initialSchema prop from the
         * refreshed server component is ignored after mount. The step landed
         * in the database while the canvas kept showing the old version —
         * the buttons flipped, nothing visibly changed.
         */
        const refreshed = await listPagesAction(siteId);
        setPages(refreshed);
        paintFrom(refreshed, activeSlug);

        /*
         * A step that restored the header or footer repaints it, and SAYS so.
         *
         * Both halves matter. The canvas keeps chrome in its own state, so
         * without the repaint the restored header would sit in the database
         * behind the old one on screen. And "Stepped back one version" gave no
         * clue what had moved — the message that accompanied undo silently
         * failing to touch the header at all.
         */
        if (result.chrome) {
          setChrome(result.chrome as typeof chrome);
          say(
            direction === "undo"
              ? "Put your header and footer back to how they were."
              : "Restored the header and footer change.",
          );
        } else {
          say(direction === "undo" ? "Stepped back one version." : "Stepped forward one version.");
        }
      } else {
        setHistory(await getHistoryStateAction({ siteId, slug: activeSlug }));
        say(result.error);
      }
    } finally {
      setStepping(false);
    }
  }

  /**
   * Re-reads the pages from the server and repaints everything that follows.
   *
   * The tail of every successful write, extracted because a second caller
   * arrived: the Images tab can now take a photograph off a page, and the
   * dashboard sits OVER the canvas — so without this the client removes a
   * picture, closes the dashboard, and the section still shows it. The canvas
   * had no route back from a change made outside it.
   *
   * It re-reads rather than patching local state for the same reason paintFrom
   * exists: the server is what the export will use, so the canvas should be
   * showing what the server holds and not a guess at it.
   */
  async function repaintFromServer(slug: string) {
    const refreshed = await listPagesAction(siteId);
    setPages(refreshed);
    paintFrom(refreshed, slug);
    await refreshHistory(slug);
  }

  /**
   * Repaints the canvas from a freshly-read page list.
   *
   * One function so the schema and the hero summary can never disagree —
   * every caller that re-reads pages after a write (undo, redo, pull, conflict
   * resolution, generation) has to update both, and doing that inline in five
   * places is how one of them ends up updating only the hero.
   */
  function paintFrom(list: PageSummary[], slug: string) {
    setSchema(list.find((p) => p.slug === slug)?.schema ?? null);
  }

  /**
   * Switches which page is being edited AND repaints the canvas to match.
   *
   * These must move together: changing only the target slug left the
   * previous page's content on screen, so picking "Services" still showed
   * the homepage. Always go through here rather than setActiveSlug.
   */
  function switchToPage(slug: string, known?: PageSummary[]) {
    setActiveSlug(slug);
    paintFrom(known ?? pages, slug);
    // History is per page, so the buttons have to follow the switch.
    void refreshHistory(slug);
  }

  /**
   * The one generation path, used both by autostart from the landing page
   * and by the chat box. `replaceHistory` distinguishes them: autostart owns
   * the whole transcript, whereas a chat message appends to it.
   */
  async function generate(
    userPrompt: string,
    replaceHistory: boolean,
    target?: { slug: string; title?: string },
  ) {
    const slug = target?.slug ?? activeSlug;
    setGenerating(true);
    const userMessage: ChatMessage = { id: nextId(), role: "user", text: userPrompt, steps: [] };
    setMessages((prev) => (replaceHistory ? [userMessage] : [...prev, userMessage]));
    remember("user", userPrompt);

    const aiMessageId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: aiMessageId, role: "ai", text: "Building your page…", steps: [] },
    ]);

    PLANNING_STEPS.forEach((step, i) => {
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId ? { ...m, steps: [...m.steps, step] } : m,
          ),
        );
      }, 500 * (i + 1));
    });

    /*
     * Run generation alongside the step animation. A whole page takes longer
     * than a single hero did, so the animation now usually finishes first —
     * minDelay only guarantees the steps are never cut off mid-reveal.
     *
     * The instruction goes over as the instruction. The business is loaded
     * server-side from the site record, which is the fix for the bug where
     * "build home page" WAS the business description.
     */
    const minDelay = new Promise<void>((resolve) =>
      setTimeout(resolve, 500 * (PLANNING_STEPS.length + 1)),
    );
    let result;
    try {
      [result] = await Promise.all([
        generatePageAction({ siteId, slug, title: target?.title, instruction: userPrompt }),
        minDelay,
      ]);
    } catch {
      const failed = "I couldn't reach the generator. Nothing was changed — try again in a moment.";
      setMessages((prev) => prev.map((m) => (m.id === aiMessageId ? { ...m, text: failed, steps: [] } : m)));
      remember("ai", failed);
      setGenerating(false);
      return;
    }

    // Generation settles the header and footer on the first run; adopt them so
    // the canvas frames the page without waiting for a reload.
    if (result.chrome.header || result.chrome.footer) setChrome(result.chrome);

    // Replace the planning steps with what was actually built, section by
    // section, so the report describes the page rather than the process.
    setMessages((prev) =>
      prev.map((m) => (m.id === aiMessageId ? { ...m, steps: result.steps } : m)),
    );

    // Persist before telling the user it worked, so the message reflects
    // what actually happened rather than optimism — a failed save here used
    // to be silent, leaving the canvas showing work that was already lost.
    let saved = true;
    try {
      await savePageSchemaAction({
        siteId,
        slug,
        title: target?.title,
        schema: result.schema,
        reason: userPrompt,
      });
      // Refresh the list first so the freshly written content is what the
      // canvas switches to, not a stale copy.
      const refreshed = await listPagesAction(siteId);
      setPages(refreshed);
      switchToPage(slug, refreshed);
      // The write just pushed an undo step and dropped any redo branch.
      await refreshHistory(slug);
    } catch {
      saved = false;
    }

    const pageLabel = slug === "home" ? "homepage" : `${slug} page`;
    const count = result.schema.nodes.length;
    const built = `${count} section${count === 1 ? "" : "s"}`;

    const base = saved
      ? target
        ? `Created your ${pageLabel} — ${built}. You're now editing it — say "go to home page" to switch back.`
        : replaceHistory
          ? `Here's a first pass at your homepage — ${built}.`
          : `Updated your ${pageLabel} — ${built}. Say "undo" to put back the previous version.`
      : "I built this, but couldn't save it. Your changes may be lost if you reload.";

    /*
     * A degraded build says so. Without this the fallback hero was reported in
     * exactly the same words as a full page, so an expired API key looked like
     * a finished homepage that had simply come out short.
     */
    const replyText = saved && result.degraded ? `${base} ${result.degraded}` : base;

    setMessages((prev) =>
      prev.map((m) => (m.id === aiMessageId ? { ...m, text: replyText } : m)),
    );
    remember("ai", replyText, result.steps);
    setGenerating(false);
    router.replace(builderPath);
  }

  function runAutostart(userPrompt: string) {
    return generate(userPrompt, true);
  }

  /**
   * Intake submitted: close the cover and build.
   *
   * `summary` is a human sentence describing what was saved, NOT the form's
   * contents. The facts themselves reach generation from the database, so a
   * phone number is never text the model can reword — see the note on
   * summarise() in app/actions/intake.ts.
   */
  async function onIntakeDone(
    summary: string,
    rebuild: boolean,
    savedFacts: Record<string, string>,
  ) {
    setIntakeOpen(false);
    const wasFirstBuild = !intake.completed;

    /*
     * Repaint the canvas with the new details immediately.
     *
     * Contact fields in generated content are {{phone}}-style tokens, so
     * updating the facts is enough to change what the page shows — no
     * regeneration, and nothing already written gets touched.
     */
    setFacts(savedFacts);

    // Re-read rather than trusting the form's local copy, so what the builder
    // holds is what was actually stored.
    try {
      const fresh = await loadIntakeAction(siteId);
      setIntake(fresh);
      setFacts(fresh.facts);
    } catch {
      setIntake((prev) => ({ ...prev, completed: true }));
    }

    if (rebuild) {
      void generate(summary, wasFirstBuild);
      return;
    }

    /*
     * Saving is NOT building. Correcting a phone number used to regenerate the
     * whole page, which threw away any copy the client had already edited and
     * spent an AI call to do it.
     *
     * The WordPress caveat is stated rather than left to be discovered: the
     * live site reads these from its own options, which are only updated by an
     * export.
     */
    say(
      wpUrl
        ? "Saved your business details. Contact details on the page follow them automatically — export to update the live WordPress site."
        : "Saved your business details. Contact details on the page follow them automatically.",
    );
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (autostart && prompt) {
      // Deferred (no cleanup/cancellation) so the state updates inside
      // runAutostart happen as a reaction to this timer firing, not
      // synchronously during the effect. Deliberately NOT returning a
      // cleanup that clears this timeout — React Strict Mode's dev-mode
      // double-invoke (mount → cleanup → mount) would cancel the first
      // timer and then the ran.current guard would block the second
      // invocation from scheduling a new one, so autostart would never
      // fire at all. The ran.current guard alone already prevents this
      // from running twice.
      setTimeout(() => runAutostart(prompt), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [messages]);

  async function onSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || generating) return;

    /*
     * Checked here as well as covered by the lock notice.
     *
     * The overlay stops the mouse, but not the keyboard: if the caret was
     * already in the chat box when the lock appeared, Enter would still submit
     * straight past it. A cover that only blocks one input device is not a
     * lock, so the guard belongs on the action itself.
     */
    if (locks.length > 0 && !lockOverridden) return;

    setDraft("");

    // "undo"/"redo" are handled here rather than as intents, because they must
    // never reach the generator — that is what destroys work. Both delegate to
    // the same helper the toolbar buttons use, so the two routes cannot drift.
    const stepWord = text.match(/^\s*(undo|redo)\b/i);
    if (stepWord) {
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
      remember("user", text);
      await stepHistoryBy(stepWord[1].toLowerCase() as "undo" | "redo");
      return;
    }

    // The confirmation the blocked-export message tells the user to type. A
    // typed phrase rather than a button, so overwriting someone's WordPress
    // edit can't happen through a mis-click.
    if (/^\s*overwrite\s+wordpress\b/i.test(text)) {
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
      remember("user", text);
      await onExport(true);
      return;
    }

    const intent = detectIntent(text);

    /*
     * "Recreate the quote page" is one request, not a delete and a create.
     * Regenerating reaches the same place without destroying anything — and
     * the page's history is kept, so a rebuild someone dislikes can be undone.
     */
    /*
     * "Build my site from <url>" does NOT build anything. It opens the
     * business-details form with that site already being read, so what the
     * page publishes lands in the same review panel as the typed-in path —
     * and nothing is filled in until the client says so. The words for the
     * site are still written from those details afterwards, as they would be
     * for anyone; the shortcut is in collecting the details, not in copying
     * the site.
     */
    if (intent.kind === "import_site") {
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
      remember("user", text);
      say(
        `I'll read ${intent.url} and show you what it publishes about your business — ` +
          `name, phone, address, services — before anything is filled in. Check each one, ` +
          `then save, and I'll build from those details.`,
      );
      setIntakeImportUrl(intent.url);
      setIntakeOpen(true);
      return;
    }

    if (intent.kind === "rebuild_page") {
      const target = pages.find((p) => p.slug === intent.slug);
      if (!target) {
        setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
        remember("user", text);
        say(`There's no ${intent.slug} page yet — say "create ${intent.slug} page" and I'll make one.`);
        return;
      }
      if (target.slug !== activeSlug) switchToPage(target.slug);
      await generate(text, false, { slug: target.slug, title: target.title });
      return;
    }

    if (intent.kind === "switch_page") {
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
      remember("user", text);
      const found = pages.find((p) => p.slug === intent.slug);
      if (found) {
        switchToPage(found.slug);
        say(`Now editing the ${found.title} page. Tell me what it should say.`);
      } else {
        say(
          `There's no ${intent.slug} page yet — say "create ${intent.slug} page" and I'll make one.`,
        );
      }
      return;
    }

    if (intent.kind === "create_page") {
      if (pages.some((p) => p.slug === intent.slug)) {
        setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
      remember("user", text);
        switchToPage(intent.slug);
        say(`That page already exists — switched to it rather than overwriting it.`);
        return;
      }
      /*
       * No prompt rewriting here any more. This used to splice the current
       * page's body copy into the prompt as a stand-in business description,
       * because the generator had no other way to learn what the business was.
       * It now loads the real site record server-side, so the instruction can
       * be passed through as what it is.
       */
      void generate(text, false, { slug: intent.slug, title: intent.title });
      return;
    }

    void runEdit(text);
  }

  /**
   * A change to the page that already exists.
   *
   * Routed to a targeted operation rather than a rebuild. Every edit used to
   * regenerate the whole page, so "create a gallery above the testimonials"
   * produced the same six sections and reported success — work claimed but not
   * done. If the instruction cannot be carried out, this now says so instead.
   */
  /* ── the canvas as an editor ──────────────────────────────────────── */

  /** The registry key of whatever is selected — the design in place now. */
  function keyOfSelection(sel: CanvasSelection): string | undefined {
    if (sel.kind === "chrome") {
      const node = sel.slot === "header" ? chrome.header : chrome.footer;
      return node ? getSectionByNodeType(node.type)?.key : undefined;
    }
    return getSectionByNodeType(nodes[sel.index]?.type)?.key;
  }

  function labelOfSelection(sel: CanvasSelection): string {
    const key = keyOfSelection(sel);
    const name = key ? getSectionByKey(key)?.name : undefined;
    if (name) return name;
    return sel.kind === "chrome" ? (sel.slot === "header" ? "Header" : "Footer") : "Section";
  }

  /** The props the selected thing holds now, which is what a swap carries. */
  function propsOfSelection(sel: CanvasSelection): Record<string, unknown> {
    if (sel.kind === "chrome") {
      const node = sel.slot === "header" ? chrome.header : chrome.footer;
      return (node?.props ?? {}) as Record<string, unknown>;
    }
    return nodes[sel.index]?.props ?? {};
  }

  /**
   * One structured change from the canvas.
   *
   * The reply lands in the transcript like any other edit. A change made by
   * clicking is still a change to the site, and a client who then asks chat
   * "what did you just do" should find it there — and the history buttons and
   * "undo" read the same revision either way.
   */

  /*
   * Copying is the one action here that changes nothing on the server, so it
   * cannot report itself through the transcript the way every other click
   * does — a line in the history saying "Copied the hero" would claim an edit
   * that never happened. It gets a passing note instead.
   */
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const runCanvasPaste = (op: CanvasPasteOp, spoken: string) =>
    runCanvasEdit(spoken, () => applyCanvasPasteAction({ siteId, slug: activeSlug, op }));

  const runCanvasOp = (op: CanvasOp, spoken: string) =>
    runCanvasEdit(spoken, () => applyCanvasOpAction({ siteId, slug: activeSlug, op }));

  /*
   * Everything a click changes goes through here.
   *
   * The action varies — an op, a paste, a picture — but what happens around
   * it must not: the busy cover, the line in the transcript, re-reading the
   * pages and repainting, and the history refresh. Passing the action in
   * rather than branching on its kind is what keeps a new kind of edit from
   * quietly acquiring three of those four.
   */
  async function runCanvasEdit(spoken: string, run: () => Promise<EditResult>) {
    setCanvasBusy(spoken);
    const aiId = nextId();
    setMessages((prev) => [...prev, { id: aiId, role: "ai", text: `${spoken}…`, steps: [] }]);

    let result;
    try {
      result = await run();
    } catch {
      const failed = "I couldn't reach the builder. Nothing was changed.";
      setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: failed } : m)));
      remember("ai", failed);
      setCanvasBusy(null);
      return;
    }

    // Chrome lives on the site, not the page, so nothing below carries it.
    if (result.ok && "chrome" in result && result.chrome) {
      setChrome(result.chrome as typeof chrome);
    }
    if (result.ok) await repaintFromServer(activeSlug);

    setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: result.message } : m)));
    remember("ai", result.message);
    setCanvasBusy(null);
  }

  /*
   * Chat steps aside while styling, and comes back afterwards.
   *
   * Styling is a looking task — you want the widest canvas you can get and
   * your eye on the page, not on a transcript. The assistant is one click
   * away on its launcher throughout, so nothing is lost; what it stops is a
   * three-column squeeze with the canvas as the narrowest of them.
   */
  /**
   * The three panels share the right-hand edge, so opening one closes the
   * others.
   *
   * Routed through functions rather than each caller setting its own flag:
   * making the PANELS exclusive was not enough, because the Ask AI launcher
   * set chatOpen directly and happily opened chat beside a panel that was
   * already there. Two columns on one edge halve the canvas, which is the
   * thing being looked at.
   */
  function openChat() {
    setStyleOpen(false);
    setStyleFor(null);
    setDesignFor(null);
    setChatOpen(true);
  }

  function openStylePanel() {
    chatWasOpen.current = chatOpen;
    setChatOpen(false);
    // One panel at a time on that edge, or two would stack and halve the
    // canvas. They answer different questions and are never both wanted.
    setDesignFor(null);
    setStyleOpen(true);
  }

  function closeStylePanel() {
    setStyleOpen(false);
    setStyleFor(null);
    setEditingIndex(null);
    // Back to whatever it was, rather than assuming it was open — a client who
    // had deliberately collapsed chat should not find it reopened for them.
    setChatOpen(chatWasOpen.current);
  }

  function openDesignPanel(sel: CanvasSelection) {
    // Same edge, so the style panel gives way — see openStylePanel.
    setStyleOpen(false);
    setStyleFor(null);
    const key = keyOfSelection(sel);
    const id = sel.kind === "chrome" ? sel.slot : `n${sel.index}`;
    // Remembered once per section, on the first open, so it is the design they
    // started from rather than the one they tried a moment ago.
    if (key) setSwapOrigin((prev) => (id in prev ? prev : { ...prev, [id]: key }));
    setDesignFor(sel);
    // The panel takes the chat pane's slot, so chat steps aside for it.
    setChatOpen(false);
  }

  function pickDesign(sel: CanvasSelection, design: string) {
    const name = getSectionByKey(design)?.name ?? "that design";
    if (sel.kind === "chrome") {
      void runCanvasOp(
        { kind: "swap_chrome", slot: sel.slot, section: design },
        `Changing your ${sel.slot} to the ${name}`,
      );
      return;
    }
    const ref = nodes[sel.index]?.type;
    if (!ref) return;
    void runCanvasOp(
      { kind: "swap_section", section: ref, design },
      `Changing the ${labelOfSelection(sel)} to the ${name}`,
    );
  }

  async function runEdit(text: string) {
    setGenerating(true);
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
    remember("user", text);

    const aiId = nextId();
    setMessages((prev) => [...prev, { id: aiId, role: "ai", text: "Making that change…", steps: [] }]);

    let result;
    try {
      result = await applyEditAction({ siteId, slug: activeSlug, instruction: text });
    } catch {
      const failed = "I couldn't reach the builder. Nothing was changed.";
      setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: failed } : m)));
      remember("ai", failed);
      setGenerating(false);
      return;
    }

    /*
     * A header or footer change repaints the canvas straight away.
     *
     * Chrome is site-wide, so none of the page-level refreshes below carry it —
     * swapping in a header with a button changed the database and left the
     * canvas showing the old one, which reads as the instruction being ignored.
     */
    if (result.ok && "chrome" in result && result.chrome) {
      setChrome(result.chrome as typeof chrome);
    }

    // A form edit changes the canvas as surely as a section edit does.
    if (result.ok && "formFields" in result && result.formFields && activeFormToken) {
      setForms((prev) => ({
        ...prev,
        [activeFormToken]: {
          fields: result.formFields as FormPreviewField[],
          style: prev[activeFormToken]?.style ?? {},
        },
      }));
    }

    // The instruction genuinely asked for the page to be written again.
    if (result.ok && "regenerate" in result && result.regenerate) {
      setMessages((prev) => prev.filter((m) => m.id !== aiId));
      setGenerating(false);
      void generate(text, false);
      return;
    }

    if (result.ok) await repaintFromServer(activeSlug);

    setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text: result.message } : m)));
    remember("ai", result.message);
    setGenerating(false);
  }

  /**
   * Records a message so it survives a reload. Best-effort by design: a
   * failure to log the conversation must never undo work that succeeded.
   */
  function remember(role: "user" | "ai", text: string, steps: string[] = []) {
    void appendBuilderMessageAction({ siteId, role, text, steps }).catch(() => {});
  }

  /** Appends an assistant message — used to report export/publish outcomes. */
  function say(text: string) {
    setMessages((prev) => [...prev, { id: nextId(), role: "ai", text, steps: [] }]);
    remember("ai", text);
  }

  async function onClearChat() {
    setMessages([]);
    await clearBuilderMessagesAction(siteId).catch(() => {});
  }

  async function onExport(force = false) {
    if (busy) return;
    setBusy("export");
    say(force ? "Overwriting WordPress…" : "Exporting to WordPress…");
    try {
      const result = await exportToWordPressAction(smbId, force);
      if (result.ok) {
        setWpUrl(result.url);
        say(
          result.provisioned
            ? `Installed WordPress and pushed your homepage. It's live at ${result.pageUrl}`
            : `Updated your WordPress site at ${result.pageUrl}`,
        );
        /*
         * A plugin that would not install does not fail the export — the site
         * published. But afterwards there is nothing to distinguish "not
         * installed" from "installed", so this is the only moment anyone can
         * be told.
         */
        if (result.pluginFailures?.length) {
          say(
            `Couldn't install ${result.pluginFailures.map((p) => p.name).join(", ")}. ` +
              "Your site is published; add them from wp-admin, or try exporting again.",
          );
        }
        await refreshSync();
      } else if ("blocked" in result) {
        /*
         * Refused rather than failed. Surfacing the pages involved and leaving
         * the banner to offer Pull is the whole point: the old behaviour pushed
         * straight over a wp-admin edit with no mention of it.
         *
         * The advice is NOT appended blindly. A refusal about content we
         * cannot represent already says that pulling loses it too, and
         * following that with "pull those changes in first" would hand
         * someone the one instruction guaranteed to destroy the thing they
         * were just warned about.
         */
        const pullWouldHelp = !result.error.includes("cannot represent");
        say(
          pullWouldHelp
            ? `${result.error} Use the notice above to pull those changes in first, ` +
                `or say "overwrite wordpress" if you're sure.`
            : `${result.error} Say "overwrite wordpress" only if you accept losing it.`,
        );
        setSyncDismissed(false);
        await refreshSync();
      } else if ("upgrade" in result) {
        // A decision, not a fault — so it is not worded as a failure.
        say(result.error);
      } else {
        say(`Couldn't export: ${result.error}`);
      }
    } catch (err) {
      say(`Couldn't export: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onOpenWpAdmin() {
    if (busy) return;
    setBusy("wpadmin");
    try {
      const result = await openWordPressAdminAction(smbId);
      if (result.ok) {
        // Opened from the click handler so the browser treats it as
        // user-initiated rather than a popup.
        window.open(result.url, "_blank", "noopener");
      } else {
        say(`Couldn't open WordPress admin: ${result.error}`);
      }
    } catch (err) {
      say(`Couldn't open WordPress admin: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onPublish() {
    if (busy) return;
    setBusy("publish");
    try {
      const result = await publishSiteAction(smbId);
      say(result.ok ? `Published — your site is live at ${result.url}` : `Couldn't publish: ${result.error}`);
      if (result.ok) router.refresh();
    } catch (err) {
      say(`Couldn't publish: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    /* The unhashed class is deliberate: globals.css uses it to pin the
       document to the viewport for this screen only, so the panes scroll
       internally instead of the page scrolling. */
    <div className={`${styles.builder} vibewp-fullscreen`}>
      <SiteDetailsDrawer
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        details={siteDetails}
      />
      {intakeOpen && (
        <IntakeForm
          siteId={siteId}
          initial={intake.data}
          isFirstBuild={!intake.completed}
          initialImportUrl={intakeImportUrl ?? undefined}
          onDone={(summary, rebuild, savedFacts) => {
            setIntakeImportUrl(null);
            void onIntakeDone(summary, rebuild, savedFacts);
          }}
          onCancel={() => {
            setIntakeImportUrl(null);
            setIntakeOpen(false);
          }}
        />
      )}

      <div className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} />
          VibeWP
        </div>
        <button
          type="button"
          className={styles.menuIconBtn}
          onClick={() => setDetailsOpen(true)}
          title="Site details"
          aria-label="Site details"
        >
          <HamburgerIcon />
        </button>
        <a className={styles.backLink} href={backPath}>
          ← {backLabel}
        </a>
        <div className={styles.topMid}>
          <span className={styles.siteName}>{siteName}</span>
          {pages.length > 1 && (
            <select
              aria-label="Page being edited"
              value={activeSlug}
              onChange={(e) => switchToPage(e.target.value)}
              style={{
                marginLeft: "0.6rem",
                padding: "0.25rem 0.5rem",
                borderRadius: 8,
                border: "1px solid var(--line, #dbdee3)",
                fontSize: "0.82rem",
                background: "transparent",
              }}
            >
              {pages.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          {/*
            Reopens the intake form. The details it holds drive every generated
            page, so it belongs beside the page being edited rather than buried
            in a settings screen the client would have to leave the builder for.
          */}
          <button
            type="button"
            className={styles.detailsBtn}
            onClick={() => setIntakeOpen(true)}
            title="Business name, contact details, services and colours"
          >
            Business details
          </button>

          {/*
            Beside Business details, because they are the same kind of thing:
            what the site IS, and what it LOOKS like. Both belong next to the
            page being edited rather than in a settings screen the client has
            to leave the builder for.
          */}
          <button
            type="button"
            className={`${styles.detailsBtn} ${dashTab === "style" ? styles.detailsBtnOn : ""}`}
            onClick={() => openDash(dashTab === "style" ? null : "style")}
            title="Heading size, spacing, corners and page width"
            aria-pressed={dashTab === "style"}
          >
            Style
          </button>
          {/*
            The library, openable on its own so images can be uploaded before
            there is anywhere to put them — which is the usual order: a client
            gathers their photographs first and places them afterwards.
          */}
          <button
            type="button"
            className={`${styles.detailsBtn} ${dashTab === "images" ? styles.detailsBtnOn : ""}`}
            onClick={() => openDash(dashTab === "images" ? null : "images")}
            title="Your uploaded images"
            aria-pressed={dashTab === "images"}
          >
            Images
          </button>
          <button
            type="button"
            className={`${styles.detailsBtn} ${dashTab === "seo" ? styles.detailsBtnOn : ""}`}
            onClick={() => openDash(dashTab === "seo" ? null : "seo")}
            title="Page titles and descriptions for search engines"
            aria-pressed={dashTab === "seo"}
          >
            SEO
          </button>
        </div>

        {/*
          Undo/redo sit next to the page switcher rather than with the publish
          actions, because they act on the document being edited. Disabled
          strictly from server-reported depth, so a button is never offered
          when the step behind it would fail.
        */}
        <div className={styles.historyGroup}>
          <button
            type="button"
            className={styles.historyBtn}
            onClick={() => void stepHistoryBy("undo")}
            disabled={!history.canUndo || stepping || generating}
            title={history.canUndo ? "Undo the last change" : "Nothing to undo on this page yet"}
            aria-label="Undo"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className={styles.historyBtn}
            onClick={() => void stepHistoryBy("redo")}
            disabled={!history.canRedo || stepping || generating}
            title={history.canRedo ? "Redo the change you undid" : "Nothing to redo — undo something first"}
            aria-label="Redo"
          >
            <RedoIcon />
          </button>
        </div>

        {/*
          Icons only. title and aria-label carry the name that used to be
          visible — dropping the text from the screen must not drop it from the
          accessibility tree, or the control becomes unusable with a reader.
        */}
        <div className={styles.viewportToggle}>
          {([
            ["desktop", <DesktopIcon key="d" />, "Desktop"],
            ["tablet", <TabletIcon key="t" />, "Tablet"],
            ["mobile", <MobileIcon key="m" />, "Mobile"],
          ] as const).map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              className={viewport === key ? styles.active : ""}
              onClick={() => setViewport(key)}
              title={label}
              aria-label={label}
              aria-pressed={viewport === key}
            >
              {icon}
            </button>
          ))}
          <button
            type="button"
            className={styles.reloadBtn}
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload the preview"
            aria-label="Reload the preview"
          >
            <ReloadIcon />
          </button>
        </div>
        <div className={styles.topActions}>
          {/*
            Publish stays outside. It is the one irreversible, outward-facing
            action here, and burying it a click deep alongside three routine
            ones would make it easier to reach by accident than on purpose.
          */}
          {/*
            The whole menu is WordPress: view the install, open wp-admin,
            push to it. A Vibe site has none of those, and an "Export to
            WordPress" item that always refuses would be worse than no menu —
            the canvas beside it already IS the preview. What it does have,
            once published, is an address, and that is worth one link.
          */}
          {mode === "vibe" && vibeUrl && (
            <a className={styles.btn} href={vibeUrl} target="_blank" rel="noreferrer">
              View site ↗
            </a>
          )}
          {mode === "wordpress" && (
            <div className={styles.menuWrap} ref={siteMenuRef}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => setSiteMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={siteMenuOpen}
                disabled={busy !== null}
              >
                {busy === "wpadmin"
                  ? "Opening…"
                  : busy === "export"
                    ? "Exporting…"
                    : "Preview"}{" "}
                ▾
              </button>
              {siteMenuOpen && (
                <div className={styles.menu} role="menu">
                  {wpUrl && (
                    <a
                      className={styles.menuItem}
                      role="menuitem"
                      href={wpUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setSiteMenuOpen(false)}
                    >
                      View site ↗
                    </a>
                  )}
                  {wpUrl && (
                    <button
                      type="button"
                      className={styles.menuItem}
                      role="menuitem"
                      onClick={() => {
                        setSiteMenuOpen(false);
                        void onOpenWpAdmin();
                      }}
                    >
                      WP Admin ↗
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.menuItem}
                    role="menuitem"
                    /*
                     * Must NOT be `onClick={onExport}`: React would pass the click
                     * event as the `force` argument, and a MouseEvent is truthy —
                     * so every ordinary click would bypass the overwrite guard.
                     */
                    onClick={() => {
                      setSiteMenuOpen(false);
                      void onExport(false);
                    }}
                  >
                    Export to WordPress
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onPublish}
            disabled={busy !== null}
          >
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      {syncReport && !syncDismissed && (
        <SyncBanner
          report={syncReport}
          busy={syncBusy}
          onPull={(slug) => void onPull(slug)}
          onResolve={(slug, keep) => void onResolve(slug, keep)}
          onOpenWpAdmin={() => void onOpenWpAdmin()}
          onDismiss={() => setSyncDismissed(true)}
        />
      )}

      <div className={styles.panes}>
        {/*
          Inside .panes, which is already positioned, so the cover stops at the
          chat and canvas and leaves the toolbar reachable. "Back to dashboard"
          and "Open WordPress admin" are the two things someone actually wants
          while locked out — blocking them would leave the message with no way
          to act on it.
        */}
        <WordPressLockNotice
          locks={lockOverridden ? [] : locks}
          onRecheck={checkLocks}
          onOverride={() => setLockOverridden(true)}
        />

        <div
          className={`${styles.chatPane} ${chatOpen ? "" : styles.collapsed} ${
            pinned ? styles.pinned : ""
          }`}
        >
          <div className={styles.chatHeader}>
            <span>Assistant</span>
            <div className={styles.chatHeaderActions}>
              <button
                type="button"
                className={`${styles.iconBtn} ${pinned ? styles.on : ""}`}
                title={pinned ? "Unpin — show side by side" : "Pin — float over the preview"}
                aria-label={pinned ? "Unpin assistant" : "Pin assistant over the preview"}
                aria-pressed={pinned}
                onClick={() => setPinned((v) => !v)}
              >
                <PinIcon />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="Clear conversation"
                aria-label="Clear conversation"
                onClick={onClearChat}
              >
                <TrashIcon />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                title="Close assistant"
                aria-label="Close assistant"
                onClick={() => setChatOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
          </div>
          <div className={styles.chatScroll} ref={chatScrollRef}>
            {messages.map((m) =>
              m.role === "user" ? (
                <div className={styles.msgUser} key={m.id}>
                  {m.text}
                </div>
              ) : (
                <div className={styles.msgAi} key={m.id}>
                  <div className={styles.avatar} />
                  <div className={styles.bubble}>
                    {m.text}
                    {m.steps.map((step) => (
                      <div className={styles.step} key={step}>
                        <span className={styles.dot} /> {step}
                      </div>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
          <Composer
            draft={draft}
            onDraft={setDraft}
            onSubmit={onSendMessage}
            busy={generating}
            scope={pages.find((p) => p.slug === activeSlug)?.title ?? activeSlug}
          />
        </div>

        <div
          className={styles.canvasPane}
        >
          <div className={styles.canvasScroll}>
            <div
              // Desktop needs no modifier: the frame is uncapped by default and
              // simply fills the pane, docked assistant or not.
              className={`${styles.canvasFrame} ${
                viewport === "mobile"
                  ? styles.mobile
                  : viewport === "tablet"
                    ? styles.tablet
                    : ""
              }`}
            >
              {schema ? (
                /*
                 * Header, page, footer — one document, so the canvas is the
                 * whole site rather than a page floating on its own.
                 *
                 * The chrome used to be app furniture: a hardcoded brand name
                 * beside the words Services/About/Contact, and no footer at
                 * all. It could not match the exported site because it was not
                 * made of the same thing. This renders the SAME markup export
                 * writes into parts/header.html and parts/footer.html.
                 *
                 * withPreviewPlaceholders substitutes the blocks WordPress
                 * renders in PHP — site title, navigation, social links — which
                 * carry no inner HTML and would otherwise show as nothing, and
                 * resolves the {{year}} token in the copyright line.
                 */
                <PreviewFrame
                  key={reloadKey}
                  html={withPreviewPlaceholders(
                    composePageBody({
                      header: chrome.header,
                      footer: chrome.footer,
                      schema,
                      hasLogo: Boolean(intake.data.logoUrl),
                      // The canvas is an editor now: a click has to trace back
                      // to a node. Off for a served page and for export.
                      markNodes: true,
                    }),
                    {
                      businessName: siteName,
                      facts,
                      logoUrl: intake.data.logoUrl,
                      // The real pages, so the canvas menu lists what the site
                      // actually has. The exported site's navigation falls back
                      // to exactly this list.
                      pages: pages.map((p) => ({ slug: p.slug, title: p.title })),
                      formFields: activeForm?.fields ?? [],
                      formToken: activeFormToken,
                      formStyle: activeForm?.style ?? {},
                    },
                  )}
                  // The palette the client chose, so the canvas is that site's
                  // colours rather than the theme's defaults.
                  colors={intake.data.colors}
                  designTokens={designTokens}
                  /*
                   * Clicking the canvas menu edits that page, which is the
                   * nearest honest equivalent to what the link does on the live
                   * site. Guarded: a menu can name a page that has not been
                   * built yet, and switching to one would show an empty canvas
                   * with no way back.
                   */
                  onNavigate={(slug) => {
                    if (pages.some((p) => p.slug === slug)) switchToPage(slug);
                  }}
                  selection={selection}
                  onSelect={(sel) => {
                    setSelection(sel);
                    /*
                     * Leaving a section leaves its edit mode.
                     *
                     * Without this the mode outlives the visit: come back to a
                     * section edited earlier and it would be typeable again
                     * without anyone pressing Edit — which is most of the
                     * behaviour the mode was added to remove. Indices also
                     * shift when sections are moved or duplicated, so a
                     * remembered one can end up naming a different section
                     * altogether.
                     */
                    if (sel?.kind !== "node" || sel.index !== editingIndex) {
                      setEditingIndex(null);
                    }
                    /*
                     * Selecting a section opens the style panel on its own —
                     * it used to only appear once Edit was clicked, which is
                     * one click more than "select a section, see its style
                     * controls" implies. Edit still exists for making text
                     * typeable; it no longer has to be entered just to see
                     * what a section's own settings are.
                     *
                     * openStylePanel() is safe to call every time a node is
                     * selected — it collapses chat and clears the design
                     * panel on that same edge, which is one panel too many
                     * regardless of how this one opened.
                     */
                    if (sel?.kind === "node") {
                      setStyleFor(sel);
                      if (!styleOpen) openStylePanel();
                    } else if (styleOpen) {
                      // Deselecting (clicking the canvas background, a
                      // different kind of target) closes it rather than
                      // leaving it pointed at a section no longer outlined.
                      closeStylePanel();
                    }
                    // Clicking a different section while the panel is open
                    // retargets it, rather than leaving it pointed at the
                    // section that is no longer outlined.
                    if (sel && designFor) openDesignPanel(sel);
                    if (!sel) setDesignFor(null);
                  }}
                  onGeometry={setBoxes}
                  /*
                   * Only the SELECTED section's props: the frame makes text
                   * editable in that section alone, so handing it the whole
                   * page would be work it throws away on every click.
                   */
                  /*
                   * undefined unless this section is in edit mode, which is
                   * the whole gate: PreviewFrame makes nothing editable
                   * without props to match text against.
                   */
                  editableProps={
                    selection?.kind === "node" && editingIndex === selection.index
                      ? nodes[selection.index]?.props
                      : undefined
                  }
                  onParts={setRenderedParts}
                  onPartAction={(action, part, parts) => {
                    if (selection?.kind !== "node") return;
                    const ref = nodes[selection.index]?.type;
                    if (!ref) return;
                    const label = labelOfSelection(selection);

                    if (action === "replace") {
                      // The photo's own path, found the way the picker finds it.
                      setMediaTarget({ index: selection.index, path: "image", label });
                      setMediaOpen(true);
                      return;
                    }

                    /*
                     * A drag brings the whole new order with it — the canvas
                     * worked it out from where the pointer let go, and the
                     * server should not have to reconstruct that from a
                     * direction.
                     */
                    if (action.startsWith("order:")) {
                      void runCanvasOp(
                        { kind: "move_part", section: ref, order: action.slice("order:".length) },
                        `Rearranging the ${label}`,
                      );
                      return;
                    }

                    if (action === "up" || action === "down") {
                      const from = parts.indexOf(part);
                      const to = from + (action === "up" ? -1 : 1);
                      if (from < 0 || to < 0 || to >= parts.length) return;
                      const next = [...parts];
                      next.splice(to, 0, next.splice(from, 1)[0]);
                      void runCanvasOp(
                        { kind: "move_part", section: ref, order: next.join(",") },
                        `Rearranging the ${label}`,
                      );
                      return;
                    }

                    if (action === "delete") {
                      void runCanvasOp(
                        { kind: "remove_part", section: ref, part },
                        `Removing part of the ${label}`,
                      );
                      return;
                    }

                    /*
                     * "-open" actions are submenu toggles handled in the
                     * canvas and never reach here; the belt-and-braces check
                     * is because dispatching a width of "open" would be a
                     * refusal the client could not interpret.
                     */
                    if (action.startsWith("width-") && !action.endsWith("-open")) {
                      void runCanvasOp(
                        {
                          kind: "set_option",
                          section: ref,
                          option: widthFieldFor(part),
                          value: action.slice("width-".length),
                        },
                        `Resizing part of the ${label}`,
                      );
                      return;
                    }

                    if (action.startsWith("hide-")) {
                      const which = action.slice("hide-".length);
                      const props = nodes[selection.index]?.props as
                        | Record<string, unknown>
                        | undefined;
                      const screens = which === "all" ? SCREENS : SCREENS.filter((s) => s.key === which);
                      /*
                       * "All screen sizes" is a toggle, not a set: if every
                       * one is already ticked it unhides, which is the only
                       * way back from a part hidden everywhere.
                       */
                      const allOn = SCREENS.every((s) => props?.[hideField(part, s.key)] === true);
                      const value =
                        which === "all"
                          ? !allOn
                          : props?.[hideField(part, which)] !== true;
                      for (const screen of screens) {
                        void runCanvasOp(
                          {
                            kind: "set_option",
                            section: ref,
                            option: hideField(part, screen.key),
                            value: String(value),
                          },
                          `${value ? "Hiding" : "Showing"} part of the ${label}`,
                        );
                      }
                    }
                  }}
                  onPickImage={(path) => {
                    if (selection?.kind !== "node") return;
                    setMediaTarget({
                      index: selection.index,
                      path,
                      label: labelOfSelection(selection),
                    });
                    setMediaOpen(true);
                  }}
                  onEditText={(path, value) => {
                    if (selection?.kind !== "node") return;
                    const ref = nodes[selection.index]?.type;
                    if (!ref) return;
                    void runCanvasOp(
                      { kind: "set_text", section: ref, path, value },
                      `Saving your edit to the ${labelOfSelection(selection)}`,
                    );
                  }}
                />
              ) : (
                <div className={styles.emptyCanvas}>
                  {generating
                    ? "Generating your homepage…"
                    : "Nothing built yet — describe your business in the chat to get started."}
                </div>
              )}

              {schema && (
                <CanvasOverlay
                  boxes={boxes}
                  selection={selection}
                  labelFor={labelOfSelection}
                  busy={Boolean(canvasBusy) || generating}
                  onChangeDesign={openDesignPanel}
                  editing={selection?.kind === "node" && editingIndex === selection.index}
                  onEdit={(sel) => {
                    if (sel.kind !== "node") return;
                    if (editingIndex === sel.index) {
                      /*
                       * Done leaves TEXT editing. The section is still
                       * selected — selecting it is what opens the style panel
                       * now, not entering edit mode — so the panel stays
                       * exactly as it was rather than closing under a click
                       * that never touched the selection.
                       */
                      setEditingIndex(null);
                      return;
                    }
                    setEditingIndex(sel.index);
                    // Already open from selecting this section; harmless to
                    // repeat, and correct on the rare path that reaches Edit
                    // without a selection event having fired first.
                    setStyleFor(sel);
                    openStylePanel();
                  }}
                  onMove={(sel, direction) => {
                    if (sel.kind !== "node") return;
                    const to = sel.index + direction;
                    const mine = nodes[sel.index]?.type;
                    const neighbour = nodes[to]?.type;
                    if (!mine || !neighbour) return;
                    /*
                     * Named by the NEIGHBOUR rather than by an index, because
                     * that is what move_section takes: it places a section
                     * before or after another one, so "up" is "before the one
                     * above" and "down" is "after the one below".
                     */
                    void runCanvasOp(
                      direction < 0
                        ? { kind: "move_section", section: mine, before: neighbour }
                        : { kind: "move_section", section: mine, after: neighbour },
                      `Moving the ${labelOfSelection(sel)} ${direction < 0 ? "up" : "down"}`,
                    );
                    setSelection({ kind: "node", index: to });
                  }}
                  onRemove={(sel) => {
                    if (sel.kind !== "node") return;
                    const mine = nodes[sel.index]?.type;
                    if (!mine) return;
                    void runCanvasOp(
                      { kind: "remove_section", section: mine },
                      `Removing the ${labelOfSelection(sel)}`,
                    );
                    setSelection(null);
                    setDesignFor(null);
                  }}
                  getClip={() => readClip(siteId)}
                  onDuplicate={(sel) => {
                    if (sel.kind !== "node") return;
                    void runCanvasOp(
                      { kind: "duplicate_section", index: sel.index },
                      `Duplicating the ${labelOfSelection(sel)}`,
                    );
                  }}
                  onCopy={(sel, what) => {
                    if (sel.kind !== "node") return;
                    /*
                     * Copying touches nothing on the server. It records where
                     * the section is; paste is what reads it, and reads it
                     * then rather than now — so a section edited between the
                     * two pastes as it stands, not as it was.
                     */
                    const next: Clip = {
                      siteId,
                      slug: activeSlug,
                      index: sel.index,
                      label: labelOfSelection(sel),
                      kind: what,
                    };
                    writeClip(next);
                    setToast(
                      what === "style"
                        ? `Copied the ${next.label}'s style`
                        : `Copied the ${next.label}`,
                    );
                  }}
                  onPaste={(sel, what) => {
                    const clip = readClip(siteId);
                    if (sel.kind !== "node" || !clip) return;
                    void runCanvasPaste(
                      what === "style"
                        ? {
                            kind: "paste_style",
                            fromSlug: clip.slug,
                            fromIndex: clip.index,
                            index: sel.index,
                          }
                        : {
                            kind: "paste_section",
                            fromSlug: clip.slug,
                            fromIndex: clip.index,
                            afterIndex: sel.index,
                          },
                      what === "style"
                        ? `Pasting the style onto the ${labelOfSelection(sel)}`
                        : `Pasting the ${clip.label}`,
                    );
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/*
          A cover over the whole workspace while a canvas change is in flight.
          Two jobs: it says what is happening, and it stops a second click
          landing on a page that is about to be replaced underneath it —
          pressing another design mid-swap would send a second operation built
          from a schema that no longer matches the one on screen.

          Scoped to canvas changes. A chat edit takes just as long, but its
          progress is already in the transcript, and covering the panel would
          stop the client reading the reply they are waiting for.
        */}
        {canvasBusy && <WorkingCover label={canvasBusy} />}

        {/* aria-live so the confirmation reaches a screen reader too. */}
        {toast && (
          <div className={styles.copyToast} role="status" aria-live="polite">
            {toast}
          </div>
        )}

        {dashTab && (
          <SiteDashboard
            tab={dashTab}
            onTab={openDash}
            onClose={() => openDash(null)}
            siteName={siteName}
          >
            {dashTab === "style" && (
              <StylePanel
                bare
                tokens={designTokens}
                scope={siteName}
                busy={Boolean(canvasBusy)}
                onPreview={setDesignTokens}
                onCommit={commitTokens}
                onClose={() => openDash(null)}
              />
            )}
            {dashTab === "images" && (
              <ImagesTab
                siteId={siteId}
                busy={Boolean(canvasBusy)}
                /*
                  Taking a picture off a page changes the page, and this panel
                  covers the canvas. Without this the section behind it keeps
                  the photograph until something else happens to reload.
                */
                onPagesChanged={() => repaintFromServer(activeSlug)}
              />
            )}
            {dashTab === "seo" && <SeoPanel siteId={siteId} />}
          </SiteDashboard>
        )}

        {mediaOpen && (
          <MediaPanel
            siteId={siteId}
            busy={Boolean(canvasBusy)}
            target={mediaTarget ? { label: mediaTarget.label, path: mediaTarget.path } : null}
            onClose={() => {
              setMediaOpen(false);
              setMediaTarget(null);
            }}
            onChoose={(asset) => {
              const t = mediaTarget;
              const ref = t ? nodes[t.index]?.type : undefined;
              if (!t || !ref) return;
              setMediaOpen(false);
              setMediaTarget(null);
              void runCanvasEdit(`Changing a picture in the ${t.label}`, () =>
                setSectionImageAction({
                  siteId,
                  slug: activeSlug,
                  section: ref,
                  path: t.path,
                  assetId: asset.id,
                }),
              );
            }}
          />
        )}

        {styleOpen && (
          <StylePanel
            tokens={designTokens}
            scope={siteName}
            section={
              styleFor && styleFor.kind === "node" && nodes[styleFor.index]
                ? (() => {
                    /*
                     * This section's own options, on top of the shared ones —
                     * background and width on a hero, say. Read from the
                     * registry entry for whatever type is actually selected,
                     * so a new field a section declares for itself appears
                     * here with no change to this file.
                     */
                    const ownOptions = sectionOwnOptions(
                      getSectionByNodeType(nodes[styleFor.index]?.type)?.fields,
                    );
                    return {
                      name: labelOfSelection(styleFor),
                      role: styleFor.role,
                      onClearRole: () => setStyleFor({ kind: "node", index: styleFor.index }),
                      options: [...SECTION_STYLE_OPTIONS, ...ownOptions],
                      values: Object.fromEntries(
                        [
                          ...SECTION_STYLE_OPTIONS,
                          ...ownOptions,
                          ...ELEMENT_ROLES.flatMap((r) => r.options),
                        ].map((o) => [
                          o.field,
                          String(nodes[styleFor.index]?.props?.[o.field] ?? o.spec.default ?? "default"),
                        ]),
                      ),
                      /*
                       * Dispatched as set_option, the operation that already
                       * exists — so it is validated against the field's
                       * choices, written with a revision, and undoable, with
                       * no new code and no second path to keep in step with
                       * chat.
                       */
                      onChange: (field: string, value: string) => {
                        const ref = nodes[styleFor.index]?.type;
                        if (!ref) return;
                        void runCanvasOp(
                          { kind: "set_option", section: ref, option: field, value },
                          `Restyling the ${labelOfSelection(styleFor)}`,
                        );
                      },
                    };
                  })()
                : undefined
            }
            busy={Boolean(canvasBusy)}
            /*
             * Preview writes state only, so the canvas tracks the slider
             * without a round trip per pixel; commit persists on release.
             */
            onPreview={setDesignTokens}
            onCommit={commitTokens}
            onClose={closeStylePanel}
          />
        )}

        {designFor && keyOfSelection(designFor) && (
          <DesignPanel
            selection={designFor}
            currentKey={keyOfSelection(designFor)!}
            currentProps={propsOfSelection(designFor)}
            catalogue={catalogue}
            originKey={swapOrigin[designFor.kind === "chrome" ? designFor.slot : `n${designFor.index}`]}
            busy={Boolean(canvasBusy) || generating}
            context={{
              siteName,
              facts,
              logoUrl: intake.data.logoUrl,
              pages: pages.map((p) => ({ slug: p.slug, title: p.title })),
              formFields: activeForm?.fields ?? [],
              formToken: activeFormToken,
              formStyle: activeForm?.style ?? {},
              colors: intake.data.colors,
            }}
            onPick={(design) => pickDesign(designFor, design)}
            onClose={() => {
              // Chat comes back, because it stepped aside for the panel.
              openChat();
            }}
          />
        )}

        {/*
          The launcher stays reachable while a panel is open, and swaps: it is
          how someone styling a section asks a question about it without first
          working out that they have to close something. openChat clears the
          panels, so pressing it can no longer put two columns on one edge.
        */}
        {!chatOpen && (
          <button
            type="button"
            className={styles.chatFab}
            onClick={openChat}
            aria-label="Open assistant"
          >
            <span className={styles.chatFabIcon}>
              <SparkIcon />
            </span>
            Ask AI
          </button>
        )}
      </div>
    </div>
  );
}
