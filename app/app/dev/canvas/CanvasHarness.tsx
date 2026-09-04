"use client";

import { useMemo, useState } from "react";
import {
  schemaToGutenberg,
  sectionToTemplatePart,
  withPreviewPlaceholders,
} from "@/lib/wp/serialize";
import { getSectionByKey, getSectionByNodeType } from "@/lib/sections";
import { PreviewFrame, type CanvasSelection, type SectionBox } from "@/app/builder/[[...slug]]/PreviewFrame";
import { CanvasOverlay } from "@/app/builder/[[...slug]]/CanvasOverlay";
import styles from "@/app/builder/[[...slug]]/builder.module.css";
import harness from "./harness.module.css";

/** A page with two sections of the SAME design, which root-class matching could not tell apart. */
const FIXTURE = [
  "hero-split",
  "features-grid",
  "testimonials",
  "faq",
  "contact-block",
  "cta-band",
  "cta-band",
];

export function CanvasHarness() {
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [boxes, setBoxes] = useState<SectionBox[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>(FIXTURE);

  const note = (line: string) => setLog((prev) => [line, ...prev].slice(0, 8));

  const html = useMemo(() => {
    const schema = {
      schemaVersion: "1.0",
      nodes: order.map((key, i) => {
        const def = getSectionByKey(key)!;
        return { id: `n_${key}_${i}`, type: def.nodeType, props: def.sample };
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
  }, [order]);

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
      <div className={styles.canvasScroll} style={{ flex: 1, minWidth: 0 }}>
        <div className={styles.canvasFrame}>
          <PreviewFrame
            html={html}
            selection={selection}
            onSelect={(sel) => {
              setSelection(sel);
              note(sel ? `select ${JSON.stringify(sel)} → ${labelFor(sel)}` : "deselect");
            }}
            onGeometry={setBoxes}
            onNavigate={(slug) => note(`navigate ${slug}`)}
          />
          <CanvasOverlay
            boxes={boxes}
            selection={selection}
            labelFor={labelFor}
            onChangeDesign={(sel) => note(`change design: ${labelFor(sel)}`)}
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
          />
        </div>
      </div>

      <aside className={harness.panel}>
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
