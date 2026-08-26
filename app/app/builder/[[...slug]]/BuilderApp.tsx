"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./builder.module.css";
import { generateHeroContent, heroContentToSchema, type HeroContent } from "@/lib/mock-ai";
import { generateHeroContentAction } from "@/app/actions/ai-generate";
import { exportToWordPressAction, publishSiteAction } from "@/app/actions/wordpress";
import {
  savePageSchemaAction,
  listPagesAction,
  undoPageAction,
  type PageSummary,
} from "@/app/actions/pages";
import { detectIntent } from "@/lib/page-intent";
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

const GENERATION_STEPS = [
  "Selected section: HeroSplit",
  "Filled schema from your prompt",
  "Rendered — fidelity check passed",
];

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `m_${idCounter}`;
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

export function BuilderApp({
  siteId,
  smbId,
  initialPages,
  initialMessages,
  builderPath,
  backPath,
  backLabel,
  siteName,
  initialContent,
  prompt,
  autostart,
}: {
  siteId: string;
  smbId: string;
  initialPages: PageSummary[];
  initialMessages: StoredMessage[];
  builderPath: string;
  backPath: string;
  backLabel: string;
  siteName: string;
  initialContent: HeroContent | null;
  prompt: string | null;
  autostart: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (autostart && prompt) return []; // populated by the autostart effect below
    // A stored transcript wins: the conversation is the record of how this
    // site got built, and losing it on every reload made the chat feel amnesiac.
    if (initialMessages.length > 0) return initialMessages;
    if (!initialContent) {
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
  const [content, setContent] = useState<HeroContent | null>(initialContent);
  const [generating, setGenerating] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [chatOpen, setChatOpen] = useState(true);
  /** Off by default: docked as a second column. Pinning floats it over the preview. */
  const [pinned, setPinned] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"export" | "publish" | null>(null);
  const [wpUrl, setWpUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<PageSummary[]>(initialPages);
  /** Which page generation writes to. Everything used to assume "home". */
  const [activeSlug, setActiveSlug] = useState("home");
  const ran = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  /**
   * The one generation path, used both by autostart from the landing page
   * and by the chat box. `replaceHistory` distinguishes them: autostart owns
   * the whole transcript, whereas a chat message appends to it.
   */
  async function generate(
    userPrompt: string,
    replaceHistory: boolean,
    target?: { slug: string; title?: string },
    /**
     * What actually goes to the model, when it differs from what the user
     * typed. "create services page" is an instruction, not a description of
     * the business — sending it verbatim produced a page about building
     * service pages. The caller supplies real context instead.
     */
    promptOverride?: string,
  ) {
    const slug = target?.slug ?? activeSlug;
    const aiPrompt = promptOverride ?? userPrompt;
    setGenerating(true);
    const userMessage: ChatMessage = { id: nextId(), role: "user", text: userPrompt, steps: [] };
    setMessages((prev) => (replaceHistory ? [userMessage] : [...prev, userMessage]));
    remember("user", userPrompt);

    const aiMessageId = nextId();
    setMessages((prev) => [
      ...prev,
      { id: aiMessageId, role: "ai", text: "Building your homepage…", steps: [] },
    ]);

    GENERATION_STEPS.forEach((step, i) => {
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId ? { ...m, steps: [...m.steps, step] } : m,
          ),
        );
      }, 500 * (i + 1));
    });

    // Kick off real generation in parallel with the step-reveal animation —
    // Promise.all so the steps always finish playing out even if the AI
    // call resolves faster, and we still wait for the AI call even if it's
    // slower than the canned ~2s animation. The action itself already falls
    // back to the keyword mock internally on any provider error; this catch
    // is a second safety net in case the client-to-server call itself fails.
    const minDelay = new Promise<void>((resolve) =>
      setTimeout(resolve, 500 * (GENERATION_STEPS.length + 1)),
    );
    const [generated] = await Promise.all([
      generateHeroContentAction(aiPrompt).catch(() => generateHeroContent(aiPrompt)),
      minDelay,
    ]);

    setContent(generated);

    // Persist before telling the user it worked, so the message reflects
    // what actually happened rather than optimism — a failed save here used
    // to be silent, leaving the canvas showing work that was already lost.
    let saved = true;
    try {
      await savePageSchemaAction({
        siteId,
        slug,
        title: target?.title,
        schema: heroContentToSchema(generated),
        reason: userPrompt,
      });
      setPages(await listPagesAction(siteId));
      setActiveSlug(slug);
    } catch {
      saved = false;
    }

    const pageLabel = slug === "home" ? "homepage" : `${slug} page`;
    const replyText = saved
      ? target
        ? `Created your ${pageLabel}. You're now editing it — say "go to home page" to switch back.`
        : replaceHistory
          ? "Here's a first pass at your homepage."
          : `Updated your ${pageLabel}. Say "undo" to put back the previous version.`
      : "I built this, but couldn't save it. Your changes may be lost if you reload.";

    setMessages((prev) =>
      prev.map((m) => (m.id === aiMessageId ? { ...m, text: replyText } : m)),
    );
    remember("ai", replyText, GENERATION_STEPS);
    setGenerating(false);
    router.replace(builderPath);
  }

  function runAutostart(userPrompt: string) {
    return generate(userPrompt, true);
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
    setDraft("");

    // "undo" is handled here rather than as an intent, because it must never
    // reach the generator — that is what destroys work.
    if (/^\s*undo\b/i.test(text)) {
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
      remember("user", text);
      const result = await undoPageAction({ siteId, slug: activeSlug });
      if (result.ok) {
        say("Put back the previous version. Reloading…");
        router.refresh();
      } else {
        say(result.error);
      }
      return;
    }

    const intent = detectIntent(text);

    if (intent.kind === "switch_page") {
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
      remember("user", text);
      const found = pages.find((p) => p.slug === intent.slug);
      if (found) {
        setActiveSlug(found.slug);
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
        setActiveSlug(intent.slug);
        say(`That page already exists — switched to it rather than overwriting it.`);
        return;
      }
      // Describe the business to the model, not the command that was typed.
      // Whatever is on the current page is the best available summary of
      // what this business actually does.
      const businessContext = content?.body ?? content?.heading ?? "";
      const contextualPrompt = businessContext
        ? `Write the "${intent.title}" page for ${siteName}. The business is described as: ${businessContext}. Focus the copy on what this page is for, not on website building.`
        : `Write the "${intent.title}" page for ${siteName}.`;
      void generate(text, false, { slug: intent.slug, title: intent.title }, contextualPrompt);
      return;
    }

    void generate(text, false);
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

  async function onExport() {
    if (busy) return;
    setBusy("export");
    say("Exporting to WordPress…");
    try {
      const result = await exportToWordPressAction(smbId);
      if (result.ok) {
        setWpUrl(result.url);
        say(
          result.provisioned
            ? `Installed WordPress and pushed your homepage. It's live at ${result.pageUrl}`
            : `Updated your WordPress site at ${result.pageUrl}`,
        );
      } else {
        say(`Couldn't export: ${result.error}`);
      }
    } catch (err) {
      say(`Couldn't export: ${err instanceof Error ? err.message : String(err)}`);
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
    <div className={styles.builder}>
      <div className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} />
          VibeWP
        </div>
        <a className={styles.backLink} href={backPath}>
          ← {backLabel}
        </a>
        <div className={styles.topMid}>
          <span className={styles.siteName}>{siteName}</span>
          {pages.length > 1 && (
            <select
              aria-label="Page being edited"
              value={activeSlug}
              onChange={(e) => setActiveSlug(e.target.value)}
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
        </div>
        <div className={styles.viewportToggle}>
          <button
            className={viewport === "desktop" ? styles.active : ""}
            onClick={() => setViewport("desktop")}
          >
            🖥 Desktop
          </button>
          <button
            className={viewport === "mobile" ? styles.active : ""}
            onClick={() => setViewport("mobile")}
          >
            📱 Mobile
          </button>
        </div>
        <div className={styles.topActions}>
          {wpUrl && (
            <a className={styles.btn} href={wpUrl} target="_blank" rel="noreferrer">
              View site ↗
            </a>
          )}
          <button type="button" className={styles.btn} onClick={onExport} disabled={busy !== null}>
            {busy === "export" ? "Exporting…" : "Export to WordPress"}
          </button>
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

      <div className={styles.panes}>
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
          <div className={styles.chatInput}>
            <form onSubmit={onSendMessage}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask VibeWP to change something…"
                disabled={generating}
              />
              <button type="submit" disabled={generating || !draft.trim()}>
                Send
              </button>
            </form>
          </div>
        </div>

        <div
          className={styles.canvasPane}
        >
          <div className={styles.canvasScroll}>
            <div
              className={`${styles.canvasFrame} ${viewport === "mobile" ? styles.mobile : ""}`}
            >
              <div className={styles.pvNav}>
                <div className={styles.pvBrand}>{siteName}</div>
                <div className={styles.pvLinks}>
                  <span>Services</span>
                  <span>About</span>
                  <span>Contact</span>
                </div>
              </div>

              {content ? (
                <div className={`${styles.pvHero} ${styles.pvSelected}`}>
                  <div>
                    <span className={styles.pvEyebrow}>{content.eyebrow}</span>
                    <h1>{content.heading}</h1>
                    <p>{content.body}</p>
                    <div className={styles.pvActions}>
                      <span className={`${styles.pvBtn} ${styles.primary}`}>
                        {content.primaryLabel}
                      </span>
                      <span className={`${styles.pvBtn} ${styles.outline}`}>
                        {content.outlineLabel}
                      </span>
                    </div>
                  </div>
                  <div className={styles.pvMedia}>
                    <div className={styles.pvFrame} />
                    <div className={styles.pvBadge}>✓ Licensed &amp; Insured</div>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyCanvas}>
                  {generating
                    ? "Generating your homepage…"
                    : "Nothing built yet — describe your business in the chat to get started."}
                </div>
              )}
            </div>
          </div>
        </div>

        {!chatOpen && (
          <button
            type="button"
            className={styles.chatFab}
            onClick={() => setChatOpen(true)}
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
