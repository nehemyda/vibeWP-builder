"use client";

import { MediaPanel } from "@/app/builder/[[...slug]]/MediaPanel";
import { SeoPanel } from "@/app/builder/[[...slug]]/SeoPanel";
import { AltPanel } from "@/app/builder/[[...slug]]/AltPanel";
import {
  SiteDashboard,
  type DashboardTab,
} from "@/app/builder/[[...slug]]/SiteDashboard";
import { readClip, writeClip } from "@/lib/design/clipboard";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  schemaToGutenberg,
  sectionToTemplatePart,
  withPreviewPlaceholders,
} from "@/lib/wp/serialize";
import { getSectionByKey, getSectionByNodeType } from "@/lib/sections";
import { PreviewFrame, type CanvasSelection, type SectionBox } from "@/app/builder/[[...slug]]/PreviewFrame";
import { CanvasOverlay } from "@/app/builder/[[...slug]]/CanvasOverlay";
import { DesignPanel, type CatalogueEntry } from "@/app/builder/[[...slug]]/DesignPanel";
import { Composer, WorkingCover } from "@/app/builder/[[...slug]]/Composer";
import { StylePanel } from "@/app/builder/[[...slug]]/StylePanel";
import type { DesignTokens } from "@/lib/design/tokens";
import { ELEMENT_ROLES } from "@/lib/design/element-style";
import { writePath } from "@/lib/design/text-map";
import { SECTIONS } from "@/lib/sections";
import styles from "@/app/builder/[[...slug]]/builder.module.css";
import harness from "./harness.module.css";

/** A page with two sections of the SAME design, which root-class matching could not tell apart. */
const FIXTURE = [
  "hero-split",
  "features-grid",
  "testimonials",
  "faq",
  // Both carry small print that reads --faint, which was defined nowhere and
  // rendered at full body ink until it was fixed. Here so the difference is
  // visible without a login.
  "conversion-pricing",
  "conversion-logos",
  "contact-block",
  "cta-band",
  "cta-band",
];

const HARNESS_SITE = "dev-canvas";

export function CanvasHarness() {
  /*
   * ?panel=<index> or ?panel=header opens the panel on load.
   *
   * So looking at the panel needs no scripted clicking — which matters because
   * a programmatic click does not always repaint in an embedded browser, and a
   * stale screenshot is worse than none. Read in the state initialiser rather
   * than an effect, so there is no second render and nothing to hydrate twice.
   */
  const params = useSearchParams();
  const fromUrl = ((): CanvasSelection | null => {
    const want = params.get("panel");
    if (!want) return null;
    return want === "header" || want === "footer"
      ? { kind: "chrome", slot: want }
      : { kind: "node", index: Number(want) || 0 };
  })();

  const [selection, setSelection] = useState<CanvasSelection | null>(fromUrl);
  const [draft, setDraft] = useState(params.get("draft") ?? "");
  /* ?busy=Changing the hero shows the working cover without a server. */
  const [cover, setCover] = useState<string | null>(params.get("busy"));
  const [tokens, setTokens] = useState<DesignTokens>({});
  const [styleOpen, setStyleOpen] = useState(params.get("style") !== "0");
  /*
   * The site dashboard, so the shell and its tabs can be looked at without a
   * site behind them. Opened by ?panel=, the same way the builder does it.
   */
  const [dashTab, setDashTab] = useState<DashboardTab | null>(() => {
    const wanted = params.get("panel");
    return wanted === "style" || wanted === "images" || wanted === "seo" || wanted === "alt"
      ? wanted
      : null;
  });
  const [styleFor, setStyleFor] = useState<CanvasSelection | null>(null);
  /** Per-section settings, keyed by index — the harness's stand-in for props. */
  const [secStyle, setSecStyle] = useState<Record<number, Record<string, string>>>({});
  /** Text the client typed, keyed by section index — the harness's stand-in for a save. */
  const [edits, setEdits] = useState<Record<number, Record<string, unknown>>>({});
  const [boxes, setBoxes] = useState<SectionBox[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>(FIXTURE);
  /** Which section is in edit mode. Nothing is typeable without one. */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [parts, setParts] = useState<string[]>([]);
  const [panelFor, setPanelFor] = useState<CanvasSelection | null>(fromUrl);
  const [origin, setOrigin] = useState<string | undefined>(undefined);



  const catalogue: CatalogueEntry[] = SECTIONS.map((s) => ({
    key: s.key,
    nodeType: s.nodeType,
    name: s.name,
    description: s.description,
    category: s.category,
  }));

  const CHROME = { header: "header-cta", footer: "footer-columns" } as const;

  const keyOf = (sel: CanvasSelection) =>
    sel.kind === "chrome" ? CHROME[sel.slot] : order[sel.index];

  const note = (line: string) => setLog((prev) => [line, ...prev].slice(0, 8));

  const html = useMemo(() => {
    const schema = {
      schemaVersion: "1.0",
      nodes: order.map((key, i) => {
        const def = getSectionByKey(key)!;
        return {
          id: `n_${key}_${i}`,
          type: def.nodeType,
          props: { ...(def.sample as object), ...(secStyle[i] ?? {}), ...(edits[i] ?? {}) },
        };
      }),
    };
    const header = getSectionByKey("header-cta")!;
    const footer = getSectionByKey("footer-columns")!;
    return withPreviewPlaceholders(
      sectionToTemplatePart(header.nodeType, header.sample, { mark: "header" }) +
        schemaToGutenberg(schema, { markNodes: true }) +
        sectionToTemplatePart(footer.nodeType, footer.sample, { mark: "footer" }),
      "Sunrise Bakery",
      { phone: "01225 447 812", email: "hello@example.com", address: "14 Market Street, Bath", hours: "Mon–Fri 9–5" },
      undefined,
      [
        { slug: "home", title: "Home" },
        { slug: "contact", title: "Contact" },
      ],
    );
  }, [order, secStyle, edits]);

  const labelFor = (sel: CanvasSelection) => {
    if (sel.kind === "chrome") return sel.slot === "header" ? "Header" : "Footer";
    const key = order[sel.index];
    return getSectionByKey(key)?.name ?? "Section";
  };

  return (
    /*
     * The panel stacks below the canvas on a narrow screen rather than
     * squeezing it. Without that, a 390px test gave the canvas 37 pixels and
     * measured the harness's own layout instead of the overlay's.
     */
    <div className={harness.shell}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative" }}>
      {cover && <WorkingCover label={cover} />}
      <div className={styles.canvasScroll} style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.canvasFrame}>
          <PreviewFrame
            html={html}
            selection={selection}
            onParts={setParts}
            onPartAction={(action, part, list) =>
              note(`part menu: ${action} on ${part} (of ${list.join(",")})`)
            }
            onSelect={(sel) => {
              setSelection(sel);
              // Leaving a section leaves its edit mode — see BuilderApp.
              if (sel?.kind !== "node" || sel.index !== editingIndex) setEditingIndex(null);
              if (sel?.kind === "node" && styleOpen) setStyleFor(sel);
              note(sel ? `select ${JSON.stringify(sel)} → ${labelFor(sel)}` : "deselect");
            }}
            onGeometry={setBoxes}
            designTokens={tokens}
            editableProps={
              selection?.kind === "node" && editingIndex === selection.index
                ? {
                    ...(getSectionByKey(order[selection.index])?.sample as object),
                    ...(secStyle[selection.index] ?? {}),
                    ...(edits[selection.index] ?? {}),
                  }
                : undefined
            }
            onEditText={(path, value) => {
              if (selection?.kind !== "node") return;
              const i = selection.index;
              const base = {
                ...(getSectionByKey(order[i])?.sample as object),
                ...(edits[i] ?? {}),
              } as Record<string, unknown>;
              setEdits((prev) => ({ ...prev, [i]: writePath(base, path, value) }));
              note(`text ${path} = ${JSON.stringify(value.slice(0, 40))}`);
            }}
            onNavigate={(slug) => note(`navigate ${slug}`)}
          />
          <CanvasOverlay
            boxes={boxes}
            selection={selection}
            labelFor={labelFor}
            editing={selection?.kind === "node" && editingIndex === selection.index}
            onEdit={(sel) => {
              if (sel.kind !== "node") return;
              if (editingIndex === sel.index) {
                setEditingIndex(null);
                setStyleOpen(false);
                note(`done editing ${labelFor(sel)}`);
                return;
              }
              setEditingIndex(sel.index);
              setStyleFor(sel);
              setStyleOpen(true);
              setPanelFor(null);
              note(`edit ${labelFor(sel)}`);
            }}
            onChangeDesign={(sel) => {
              setPanelFor(sel);
              setOrigin(keyOf(sel));
              note(`open panel for ${labelFor(sel)}`);
            }}
            onMove={(sel, dir) => {
              if (sel.kind !== "node") return;
              const next = [...order];
              const to = sel.index + dir;
              if (to < 0 || to >= next.length) return;
              [next[sel.index], next[to]] = [next[to], next[sel.index]];
              setOrder(next);
              setSelection({ kind: "node", index: to });
              note(`move ${labelFor(sel)} ${dir < 0 ? "up" : "down"} → ${to}`);
            }}
            onRemove={(sel) => {
              if (sel.kind !== "node") return;
              setOrder(order.filter((_, i) => i !== sel.index));
              setSelection(null);
              note(`remove ${labelFor(sel)}`);
            }}
            /*
             * The overflow menu. Duplicate and paste really do change the
             * fixture here, because the point of this route is to see the
             * canvas behave — a handler that only logged would not show
             * whether the bar and outlines follow a new section.
             */
            getClip={() => readClip(HARNESS_SITE)}
            onDuplicate={(sel) => {
              if (sel.kind !== "node") return;
              const next = [...order];
              next.splice(sel.index + 1, 0, order[sel.index]);
              setOrder(next);
              note(`duplicate ${labelFor(sel)} → position ${sel.index + 2}`);
            }}
            onCopy={(sel, what) => {
              if (sel.kind !== "node") return;
              writeClip({
                siteId: HARNESS_SITE,
                slug: "home",
                index: sel.index,
                label: labelFor(sel),
                kind: what,
              });
              note(`copy ${what} — ${labelFor(sel)}`);
            }}
            onPaste={(sel, what) => {
              const clip = readClip(HARNESS_SITE);
              if (sel.kind !== "node" || !clip) return;
              if (what === "section") {
                const next = [...order];
                next.splice(sel.index + 1, 0, order[clip.index]);
                setOrder(next);
              }
              note(`paste ${what} from ${clip.label} → after ${labelFor(sel)}`);
            }}
          />
        </div>
      </div>
      </div>

      {dashTab && (
        <SiteDashboard
          tab={dashTab}
          onTab={setDashTab}
          onClose={() => setDashTab(null)}
          siteName="Canvas harness"
        >
          {dashTab === "style" && (
            <StylePanel
              bare
              tokens={tokens}
              scope="Whole site"
              onPreview={setTokens}
              onCommit={setTokens}
              onClose={() => setDashTab(null)}
            />
          )}
          {/*
            No session, so the listing fails — but the layout is the point
            here: one header, one close button, and a grid that uses the
            dialog's width rather than a 340px column of it.
          */}
          {dashTab === "images" && (
            <MediaPanel
              wide
              siteId="00000000-0000-0000-0000-000000000000"
              target={null}
              onChoose={() => {}}
              onClose={() => setDashTab(null)}
            />
          )}
          {/*
            Mounted with no session, so this exercises the failure path: the
            actions require canEditSite and there is no user here. Enough to
            prove it mounts and reports rather than crashing; the populated
            table needs a real login.
          */}
          {dashTab === "seo" && <SeoPanel siteId="00000000-0000-0000-0000-000000000000" />}
          {dashTab === "alt" && <AltPanel siteId="00000000-0000-0000-0000-000000000000" />}
        </SiteDashboard>
      )}

      {styleOpen && (
        <StylePanel
          tokens={tokens}
          scope="Whole site"
          section={
            styleFor && styleFor.kind === "node"
              ? {
                  name: labelFor(styleFor),
                  role: styleFor.role,
                  onClearRole: () => setStyleFor({ kind: "node", index: styleFor.index }),
                  values: secStyle[styleFor.index] ?? {},
                  onChange: (field, value) => {
                    setSecStyle((prev) => ({
                      ...prev,
                      [styleFor.index]: { ...(prev[styleFor.index] ?? {}), [field]: value },
                    }));
                    note(`section ${styleFor.index} ${field}=${value}`);
                  },
                }
              : undefined
          }
          onPreview={setTokens}
          onCommit={(next) => {
            setTokens(next);
            note(`style ${JSON.stringify(next)}`);
          }}
          onClose={() => {
            setStyleOpen(false);
            setStyleFor(null);
          }}
        />
      )}
      {panelFor && (
        <DesignPanel
          selection={panelFor}
          currentKey={keyOf(panelFor)}
          currentProps={(getSectionByKey(keyOf(panelFor))?.sample ?? {}) as Record<string, unknown>}
          catalogue={catalogue}
          originKey={origin}
          context={{
            siteName: "Sunrise Bakery",
            facts: { phone: "01225 447 812", email: "hello@example.com", address: "14 Market Street, Bath", hours: "Mon–Fri 9–5" },
            pages: [{ slug: "home", title: "Home" }, { slug: "contact", title: "Contact" }],
            formFields: [],
            formStyle: {},
          }}
          onPick={(key) => {
            if (panelFor.kind === "node") {
              const next = [...order];
              next[panelFor.index] = key;
              setOrder(next);
            }
            note(`pick ${key}`);
          }}
          onClose={() => setPanelFor(null)}
        />
      )}

      <aside className={harness.panel}>
        {/* The real composer and the real cover, so what is checked here is
            what the builder renders. */}
        <div style={{ marginBottom: 14, border: "1px solid #e5e7eb", borderRadius: 10 }}>
          <Composer
            draft={draft}
            onDraft={setDraft}
            onSubmit={(e) => {
              e.preventDefault();
              note(`send: ${draft}`);
              setDraft("");
            }}
            busy={params.get("sending") === "1"}
            scope="Home"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setCover("Changing the Split hero to the Centred hero");
            window.setTimeout(() => setCover(null), 5000);
          }}
          style={{ marginBottom: 12, padding: "6px 10px", font: "inherit", fontSize: 12 }}
        >
          Show the 5-second cover
        </button>

        <strong style={{ display: "block", marginBottom: 8 }}>Canvas harness</strong>
        <p style={{ color: "#6b7280", margin: "0 0 12px" }}>
          Development only. Real PreviewFrame, real CanvasOverlay, fixture content. Two cta-band
          sections on purpose — root-class matching could not tell them apart.
        </p>
        <div style={{ marginBottom: 12 }}>
          <strong>selection</strong>
          <pre style={{ margin: "4px 0", fontSize: 11 }}>{JSON.stringify(selection)}</pre>
          <strong>{boxes.length} boxes reported</strong>
          <pre style={{ margin: "4px 0", fontSize: 10.5, whiteSpace: "pre-wrap" }}>
            {boxes
              .map(
                (b) =>
                  `${b.selection.kind === "node" ? `#${b.selection.index}` : b.selection.slot}` +
                  ` ${Math.round(b.top)},${Math.round(b.left)} ${Math.round(b.width)}×${Math.round(b.height)}` +
                  ` ${b.selection.kind === "node" ? getSectionByNodeType(getSectionByKey(order[b.selection.index])?.nodeType)?.key ?? "" : ""}`,
              )
              .join("\n")}
          </pre>
        </div>
        <strong>events</strong>
        <ol style={{ paddingLeft: 18, margin: "4px 0", fontSize: 11.5 }}>
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
