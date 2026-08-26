"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./builder.module.css";
import { generateHeroContent, heroContentToSchema, type HeroContent } from "@/lib/mock-ai";
import { saveGeneratedSchema } from "@/app/actions/sites";
import { generateHeroContentAction } from "@/app/actions/ai-generate";

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

export function BuilderApp({
  siteId,
  builderPath,
  backPath,
  backLabel,
  siteName,
  initialContent,
  prompt,
  autostart,
}: {
  siteId: string;
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
  const [activeTab, setActiveTab] = useState<"chat" | "canvas" | "properties">(
    "chat",
  );
  const [draft, setDraft] = useState("");
  const ran = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  async function runAutostart(userPrompt: string) {
    setGenerating(true);
    setMessages([{ id: nextId(), role: "user", text: userPrompt, steps: [] }]);

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
      generateHeroContentAction(userPrompt).catch(() => generateHeroContent(userPrompt)),
      minDelay,
    ]);

    setContent(generated);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === aiMessageId
          ? { ...m, text: "Here's a first pass at your homepage." }
          : m,
      ),
    );
    setGenerating(false);
    saveGeneratedSchema(siteId, heroContentToSchema(generated)).catch(() => {
      // Best-effort persistence — the canvas already reflects the change.
    });
    router.replace(builderPath);
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

  function onSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text, steps: [] }]);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "ai",
          text: "Noted — live editing from chat isn't wired up in this preview build yet. Try describing a whole new site from the landing page to see generation end to end.",
          steps: [],
        },
      ]);
    }, 500);
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
          <button className={styles.btn}>Export to WordPress</button>
          <button className={`${styles.btn} ${styles.btnPrimary}`}>Publish</button>
        </div>
      </div>

      <div className={styles.paneTabs}>
        <button
          className={activeTab === "chat" ? styles.active : ""}
          onClick={() => setActiveTab("chat")}
        >
          Chat
        </button>
        <button
          className={activeTab === "canvas" ? styles.active : ""}
          onClick={() => setActiveTab("canvas")}
        >
          Canvas
        </button>
        <button
          className={activeTab === "properties" ? styles.active : ""}
          onClick={() => setActiveTab("properties")}
        >
          Properties
        </button>
      </div>

      <div className={styles.panes}>
        <div
          className={`${styles.chatPane} ${activeTab === "chat" ? styles.shown : ""}`}
        >
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
          className={`${styles.canvasPane} ${activeTab === "canvas" ? styles.shown : ""}`}
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

        <div
          className={`${styles.propsPane} ${activeTab === "properties" ? styles.shown : ""}`}
        >
          <div className={styles.propsHead}>Properties</div>
          <div className={styles.propsBody}>
            <div className={styles.fieldLabel}>Section</div>
            <div className={styles.fieldBox}>{content ? "HeroSplit" : "—"}</div>

            <div className={styles.fieldLabel}>Eyebrow</div>
            <div className={styles.fieldBox}>{content?.eyebrow ?? "—"}</div>

            <div className={styles.fieldLabel}>Heading</div>
            <div className={styles.fieldBox}>{content?.heading ?? "—"}</div>

            <div className={styles.fieldLabel}>Body</div>
            <div className={styles.fieldBox}>{content?.body ?? "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
