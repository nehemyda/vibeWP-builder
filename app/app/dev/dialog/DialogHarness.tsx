"use client";

import { useState } from "react";
import { DeleteImageDialog } from "@/app/builder/[[...slug]]/DeleteImageDialog";

/*
 * A 1×1 PNG as a data URI: the thumbnail's job here is to prove its box is
 * the right size and shape, and a real photograph would make the dialog's
 * proportions depend on a network fetch.
 */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mM8w/CfAQAFBQIB1BQ8VAAAAABJRU5ErkJggg==";

const USED = [
  { pageId: "p1", path: "0.image", sectionName: "Hero banner", pageTitle: "Home" },
  { pageId: "p2", path: "3.items.1.image", sectionName: "Gallery", pageTitle: "About" },
  { pageId: "p2", path: "5.image", sectionName: "Call to action", pageTitle: "About" },
];

export function DialogHarness() {
  const [show, setShow] = useState<"used" | "unused" | "removing" | null>("used");

  return (
    <main style={{ padding: 24, display: "grid", gap: 10, justifyItems: "start" }}>
      <h1 style={{ font: "700 16px/1.3 system-ui", margin: 0 }}>Delete confirmation</h1>
      {(["used", "unused", "removing"] as const).map((k) => (
        <button key={k} type="button" onClick={() => setShow(k)}>
          {k}
        </button>
      ))}
      {show && (
        <DeleteImageDialog
          asset={{ url: PIXEL, filename: "freshly-baked-sourdough-loaves.webp" }}
          used={show === "unused" ? [] : USED}
          removing={show === "removing"}
          onKeep={() => setShow(null)}
          onRemove={() => setShow("removing")}
        />
      )}
    </main>
  );
}
