"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveFormAction, type FormFieldSpec } from "@/app/actions/forms";
import shell from "@/components/dashboard/dashboard-shell.module.css";

/** Everything a client can add. Ordered by how often it is actually wanted. */
const PALETTE: { type: FormFieldSpec["type"]; label: string }[] = [
  { type: "text", label: "Short text" },
  { type: "email", label: "Email" },
  { type: "tel", label: "Phone" },
  { type: "textarea", label: "Long text" },
  { type: "select", label: "Dropdown" },
  { type: "checkbox", label: "Checkbox" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
  { type: "url", label: "Website" },
];

/**
 * Turns a label into a storage key.
 *
 * The key is what answers are filed under, so it must be stable and unique
 * within the form — two fields sharing one name would silently overwrite each
 * other on every submission.
 */
function keyFor(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field";
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/**
 * A field's width in twelfths, tolerating forms saved before spans existed.
 *
 * Clamped because a hand-edited 0 or 40 would collapse the row or overflow it,
 * and the grid has no way to express either.
 */
function spanOf(f: FormFieldSpec): number {
  if (typeof f.span === "number") return Math.min(12, Math.max(1, Math.round(f.span)));
  return f.width === "full" ? 12 : 6;
}

const card: React.CSSProperties = {
  border: "1px solid var(--line, #e6e8ee)",
  borderRadius: 12,
  background: "var(--surface, #fff)",
  padding: "1rem",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.6rem",
  border: "1px solid var(--line, #e6e8ee)",
  borderRadius: 8,
  font: "inherit",
  fontSize: "0.88rem",
  background: "var(--surface, #fff)",
};

const ctlLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  color: "var(--ink-2, #4a5160)",
};

const smallLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--muted, #79808f)",
  marginBottom: "0.3rem",
};

/*
 * A bare number means pixels.
 *
 * Nobody types "14px" twice before it becomes annoying, and a value that
 * silently does nothing because the unit was omitted is worse than one that
 * guesses. Percentages, rem and keywords pass through untouched.
 */
function withUnit(raw: string): string {
  const v = raw.trim();
  if (v === "") return "";
  return /^-?\d*\.?\d+$/.test(v) ? `${v}px` : v;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Four boxes composed into one shorthand; blanks fall back to 0. */
function padParts(value: string): string[] {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  return [0, 1, 2, 3].map((i) => parts[i] ?? parts[i % 2] ?? parts[0] ?? "");
}

/*
 * ─────────────────────────────────────────────────────────────────────
 * THESE LIVE AT MODULE SCOPE, AND MUST STAY THERE
 *
 * Declared inside FormEditor, each render produced a NEW function identity, so
 * React saw a different component type and remounted the subtree. Every colour
 * change destroyed and recreated the <input type="color"> — which slammed the
 * native picker shut the instant you started dragging.
 *
 * A component defined during render is remounted on every render. Hoisting is
 * the fix, not memoisation.
 */
function ColorRow({
  label,
  value,
  onCommit,
  onType,
}: {
  label: string;
  value: string;
  /** A valid colour, ready to store and push to the preview. */
  onCommit: (v: string) => void;
  /** Half-typed text, kept locally so the preview is not repainted mid-hex. */
  onType: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: "0.55rem" }}>
      <label style={ctlLabel}>{label}</label>
      <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.2rem" }}>
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : "#ffffff"}
          onChange={(e) => onCommit(e.target.value)}
          style={{ ...input, width: "2.6rem", padding: 2, flex: "none" }}
        />
        <input
          aria-label={`${label} hex`}
          value={value}
          placeholder="inherit"
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v === "" || HEX.test(v)) onCommit(v);
            else onType(v);
          }}
          style={{ ...input, flex: 1, fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}
        />
      </div>
    </div>
  );
}

function TextRow({
  label,
  unit,
  value,
  onType,
  onCommit,
}: {
  label: string;
  unit?: string;
  value: string;
  onType: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: "0.55rem" }}>
      <label style={ctlLabel}>
        {label}
        {unit && <span style={{ color: "var(--faint, #9aa1ad)" }}> ({unit})</span>}
      </label>
      <input
        value={value}
        placeholder="inherit"
        onChange={(e) => onType(e.target.value)}
        onBlur={(e) => onCommit(withUnit(e.target.value))}
        style={{ ...input, marginTop: "0.2rem" }}
      />
    </div>
  );
}

function PadRow({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  const parts = padParts(value);
  return (
    <div style={{ marginBottom: "0.55rem" }}>
      <label style={ctlLabel}>
        {label} <span style={{ color: "var(--faint, #9aa1ad)" }}>(top right bottom left)</span>
      </label>
      <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.2rem" }}>
        {parts.map((v, i) => (
          <input
            key={i}
            aria-label={`${label} ${["top", "right", "bottom", "left"][i]}`}
            defaultValue={v}
            placeholder="0"
            onBlur={(e) => {
              const next = padParts(value);
              next[i] = withUnit(e.target.value);
              onCommit(next.map((x) => x || "0").join(" "));
            }}
            style={{ ...input, textAlign: "center", padding: "0.35rem 0.2rem", minWidth: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

export function FormEditor({
  smbId,
  formId,
  embedToken,
  initial,
  backHref,
}: {
  smbId: string;
  formId: string;
  /** Needed to point the preview iframe at this form. */
  embedToken: string | null;
  initial: {
    name: string;
    fields: FormFieldSpec[];
    successMessage: string;
    notifyEmails: string;
    style?: Record<string, string>;
  };
  backHref: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [fields, setFields] = useState<FormFieldSpec[]>(initial.fields);
  const [successMessage, setSuccessMessage] = useState(initial.successMessage);
  const [notifyEmails, setNotifyEmails] = useState(initial.notifyEmails);
  const [selected, setSelected] = useState<number | null>(initial.fields.length ? 0 : null);
  const [dragging, setDragging] = useState<number | null>(null);
  /** Where a drop would land, so the gap can be shown before releasing. */
  const [dropAt, setDropAt] = useState<number | null>(null);
  /** Set while dragging a NEW field in from the palette. */
  const [incoming, setIncoming] = useState<FormFieldSpec["type"] | null>(null);
  const [saved, setSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [style, setStyle] = useState<Record<string, string>>(initial.style ?? {});
  const frameRef = useRef<HTMLIFrameElement>(null);

  /*
   * Pushed to the iframe rather than re-rendered here.
   *
   * The preview runs the real embed script, so what is on screen is the form a
   * visitor gets. A React copy would be a second renderer, and two renderers
   * drift — that is how the builder canvas drifted from WordPress.
   */
  /*
   * Everything the editor currently holds, saved or not.
   *
   * Sent whenever the form changes, so the preview cannot drift from the panel
   * beside it — the failure was a field resized to full width still rendering
   * at half, because the iframe had fetched the stored definition.
   */
  function pushToPreview(nextFields = fields, nextStyle = style) {
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "vibewp:fields",
        form: {
          fields: nextFields,
          style: nextStyle,
          successMessage,
          submitLabel: nextStyle["btn-label"] || undefined,
        },
      },
      window.location.origin,
    );
  }

  function save() {
    start(async () => {
      const res = await saveFormAction({
        smbId,
        formId,
        name,
        fields,
        successMessage,
        notifyEmails,
        style,
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function setToken(key: string, value: string) {
    const next = { ...style, [key]: value };
    setStyle(next);
    frameRef.current?.contentWindow?.postMessage(
      { type: "vibewp:style", style: next },
      window.location.origin,
    );
  }
  const [pending, start] = useTransition();

  const dirty =
    name !== initial.name ||
    successMessage !== initial.successMessage ||
    notifyEmails !== initial.notifyEmails ||
    JSON.stringify(fields) !== JSON.stringify(initial.fields) ||
    JSON.stringify(style) !== JSON.stringify(initial.style ?? {});

  function addField(type: FormFieldSpec["type"], at?: number) {
    const label = PALETTE.find((p) => p.type === type)?.label ?? "Field";
    const field: FormFieldSpec = {
      type,
      label,
      name: keyFor(label, fields.map((f) => f.name)),
      span: type === "textarea" ? 12 : 6,
      ...(type === "select" ? { options: ["First choice", "Second choice"] } : {}),
    };
    const index = at ?? fields.length;
    setFields((f) => {
      const next = [...f];
      next.splice(index, 0, field);
      return next;
    });
    setSelected(index);
  }

  function patch(i: number, changes: Partial<FormFieldSpec>) {
    setFields((f) => f.map((field, n) => (n === i ? { ...field, ...changes } : field)));
  }

  /**
   * Moves a field to an INSERTION POINT, not onto another field.
   *
   * `to` counts gaps, so dropping after the last field is `fields.length`.
   * Removing first shifts every later gap down by one, which is what the
   * adjustment accounts for — without it, dragging rightwards always landed
   * one place short.
   */
  function move(from: number, to: number) {
    setFields((f) => {
      const next = [...f];
      const [moved] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, moved);
      return next;
    });
    setSelected(to > from ? to - 1 : to);
  }

  /* Fields can change from a dozen places — add, remove, drag, resize — so the
     push is driven by the value rather than added to every handler. */
  useEffect(() => {
    if (previewOpen) pushToPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, previewOpen]);

  const active = selected !== null ? fields[selected] : undefined;


  /*
   * Only what the form can actually show.
   *
   * A dropdown's styling on a form with no dropdown is a control that does
   * nothing — the same complaint as a field editor offering settings a field
   * does not have. Derived from the fields present, so it stays true as the
   * form changes.
   */
  const types = new Set(fields.map((f) => f.type));
  const hasTextInput = ["text", "email", "tel", "number", "date", "url", "textarea"].some((t) =>
    types.has(t as FormFieldSpec["type"]),
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "1rem" }}>
        <a href={backHref} className={shell.btn}>
          ← Forms
        </a>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Form name"
          style={{ ...input, maxWidth: "18rem", fontWeight: 700 }}
        />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button
            type="button"
            className={shell.btn}
            disabled={!embedToken}
            title={embedToken ? "Style it and see the real form" : "Save the form first"}
            onClick={() => setPreviewOpen(true)}
          >
            Preview &amp; style
          </button>
          {saved && !dirty && (
            <span style={{ fontSize: "0.82rem", color: "var(--muted, #79808f)" }}>Saved</span>
          )}
          <button
            type="button"
            className={`${shell.btn} ${shell.btnPrimary}`}
            disabled={pending || !dirty}
            onClick={save}
          >
            {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "12rem 1fr 16rem", gap: "1rem", alignItems: "start" }}>
        {/* ── Palette ── */}
        <div style={card}>
          <span style={smallLabel}>Add a field</span>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            {PALETTE.map((p) => (
              <button
                key={p.type}
                type="button"
                /*
                 * Draggable AND clickable. Drag is what people try first here,
                 * and it silently did nothing; click stays because dragging is
                 * awkward with a trackpad and impossible from a keyboard.
                 */
                draggable
                onDragStart={(e) => {
                  setIncoming(p.type);
                  e.dataTransfer.effectAllowed = "copy";
                  // Firefox refuses to start a drag with no payload set.
                  e.dataTransfer.setData("text/plain", p.type);
                }}
                onDragEnd={() => {
                  setIncoming(null);
                  setDropAt(null);
                }}
                onClick={() => addField(p.type)}
                style={{
                  ...input,
                  textAlign: "left",
                  cursor: "grab",
                  background: "var(--bg, #f7f8fa)",
                }}
              >
                + {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── The form itself ── */}
        <div style={card}>
          <span style={smallLabel}>The form · drag to reorder</span>
          {fields.length === 0 && (
            <p style={{ color: "var(--muted, #79808f)", fontSize: "0.88rem" }}>
              No fields yet. Add one from the left.
            </p>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gap: "0.6rem",
              minHeight: "4rem",
              position: "relative",
            }}
            /*
             * Dropping on the container, not on a field, appends. Without this
             * the empty space below the last row rejected the drop and the
             * drag simply died.
             */
            onDragOver={(e) => {
              e.preventDefault();
              if (dropAt === null) setDropAt(fields.length);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const at = dropAt ?? fields.length;
              if (incoming) addField(incoming, at);
              else if (dragging !== null) move(dragging, at);
              setDragging(null);
              setIncoming(null);
              setDropAt(null);
            }}
          >
            {fields.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                draggable
                onDragStart={() => setDragging(i)}
                onDragEnd={() => {
                  setDragging(null);
                  setDropAt(null);
                }}
                /*
                 * Which SIDE of the field the pointer is on decides whether the
                 * drop lands before or after it. Treating the whole field as
                 * one target makes the last position in a row unreachable.
                 */
                onDragOver={(e) => {
                  e.preventDefault();
                  const box = e.currentTarget.getBoundingClientRect();
                  setDropAt(e.clientX < box.left + box.width / 2 ? i : i + 1);
                }}
                onClick={() => setSelected(i)}
                style={{
                  gridColumn: `span ${spanOf(f)}`,
                  border: `1px solid ${selected === i ? "var(--primary, #f54900)" : "var(--line, #e6e8ee)"}`,
                  borderRadius: 10,
                  padding: "0.6rem 0.7rem",
                  cursor: "grab",
                  background:
                    selected === i
                      ? "color-mix(in srgb, var(--primary, #f54900) 6%, transparent)"
                      : "transparent",
                  opacity: dragging === i ? 0.4 : 1,
                  /* The insertion marker: a solid edge on the side it will land. */
                  boxShadow:
                    dropAt === i
                      ? "inset 3px 0 0 0 var(--primary, #f54900)"
                      : dropAt === i + 1
                        ? "inset -3px 0 0 0 var(--primary, #f54900)"
                        : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span aria-hidden="true" style={{ color: "var(--muted, #79808f)" }}>⠿</span>
                  <strong style={{ fontSize: "0.85rem" }}>{f.label}</strong>
                  {f.required && <span style={{ color: "var(--primary, #f54900)" }}>*</span>}
                  <button
                    type="button"
                    aria-label={`Remove ${f.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFields((prev) => prev.filter((_, n) => n !== i));
                      setSelected(null);
                    }}
                    style={{
                      marginLeft: "auto",
                      border: 0,
                      background: "none",
                      cursor: "pointer",
                      color: "var(--muted, #79808f)",
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted, #79808f)", marginTop: "0.2rem" }}>
                  {f.type} · {f.name} · {spanOf(f)}/12
                </div>
              </div>
            ))}

            {/* Landing strip for a drop past the last field. */}
            {dropAt === fields.length && fields.length > 0 && (
              <div
                style={{
                  gridColumn: "span 12",
                  height: 3,
                  borderRadius: 2,
                  background: "var(--primary, #f54900)",
                }}
              />
            )}
          </div>
        </div>

        {/* ── Settings for the selected field ── */}
        <div style={card}>
          {!active ? (
            <>
              <span style={smallLabel}>Form settings</span>
              <label style={{ ...smallLabel, marginTop: "0.7rem" }}>Thank-you message</label>
              <input value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} style={input} />
              <label style={{ ...smallLabel, marginTop: "0.7rem" }}>Notify these emails</label>
              <input
                value={notifyEmails}
                onChange={(e) => setNotifyEmails(e.target.value)}
                placeholder="you@example.com"
                style={input}
              />
              <p style={{ fontSize: "0.74rem", color: "var(--muted, #79808f)", marginTop: "0.5rem" }}>
                Notifications aren&rsquo;t sent yet — submissions still arrive in this dashboard.
              </p>
            </>
          ) : (
            <>
              <span style={smallLabel}>Field settings</span>
              <label style={{ ...smallLabel, marginTop: "0.7rem" }}>Label</label>
              <input
                value={active.label}
                onChange={(e) => patch(selected!, { label: e.target.value })}
                style={input}
              />
              <label style={{ ...smallLabel, marginTop: "0.7rem" }}>Stored as</label>
              <input
                value={active.name}
                onChange={(e) => patch(selected!, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
                style={input}
              />
              <label style={{ ...smallLabel, marginTop: "0.7rem" }}>Placeholder</label>
              <input
                value={active.placeholder ?? ""}
                onChange={(e) => patch(selected!, { placeholder: e.target.value })}
                style={input}
              />
              {active.type === "select" && (
                <>
                  <label style={{ ...smallLabel, marginTop: "0.7rem" }}>Choices (one per line)</label>
                  <textarea
                    rows={4}
                    value={(active.options ?? []).join("\n")}
                    onChange={(e) =>
                      patch(selected!, { options: e.target.value.split("\n").filter((o) => o.trim()) })
                    }
                    style={{ ...input, resize: "vertical" }}
                  />
                </>
              )}
              <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", marginTop: "0.8rem", fontSize: "0.85rem" }}>
                <input
                  type="checkbox"
                  checked={Boolean(active.required)}
                  onChange={(e) => patch(selected!, { required: e.target.checked })}
                />
                Required
              </label>
              <label style={{ ...smallLabel, marginTop: "0.9rem" }}>Width</label>
              {/*
                Presets for the widths people actually want, and a number for
                the ones they occasionally do. `width` is cleared alongside so
                the old two-value field cannot contradict the new span.
              */}
              <div style={{ display: "flex", gap: "0.3rem" }}>
                {([
                  ["⅓", 4],
                  ["½", 6],
                  ["⅔", 8],
                  ["Full", 12],
                ] as const).map(([label, value]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => patch(selected!, { span: value, width: undefined })}
                    style={{
                      ...input,
                      flex: 1,
                      padding: "0.4rem 0.2rem",
                      textAlign: "center",
                      cursor: "pointer",
                      fontWeight: spanOf(active) === value ? 700 : 400,
                      background:
                        spanOf(active) === value
                          ? "color-mix(in srgb, var(--primary, #f54900) 10%, transparent)"
                          : "var(--bg, #f7f8fa)",
                      borderColor:
                        spanOf(active) === value ? "var(--primary, #f54900)" : "var(--line, #e6e8ee)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={spanOf(active)}
                  onChange={(e) => patch(selected!, { span: Number(e.target.value), width: undefined })}
                  style={{ flex: 1 }}
                  aria-label="Width in twelfths"
                />
                <span style={{ fontSize: "0.78rem", color: "var(--muted, #79808f)", minWidth: "2.6rem" }}>
                  {spanOf(active)}/12
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{ ...input, marginTop: "0.9rem", cursor: "pointer", background: "var(--bg, #f7f8fa)" }}
              >
                Form settings
              </button>
            </>
          )}
        </div>
      </div>

      {previewOpen && embedToken && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Preview and style"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(12,16,24,.5)",
            display: "grid",
            placeItems: "center",
            padding: "2vh 2vw",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false);
          }}
        >
          <div
            style={{
              width: "min(1100px, 96vw)",
              height: "min(760px, 92vh)",
              display: "grid",
              gridTemplateColumns: "17rem 1fr",
              gridTemplateRows: "auto 1fr",
              background: "var(--surface, #fff)",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 40px 90px -30px rgba(10,14,25,.55)",
            }}
          >
            <header
              style={{
                gridColumn: "span 2",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.85rem 1.1rem",
                borderBottom: "1px solid var(--line, #e6e8ee)",
              }}
            >
              <strong style={{ fontSize: "0.95rem" }}>Preview: {name}</strong>

              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {/*
                  Says whether this is live yet, and fixes it without leaving.
                  The preview deliberately shows unsaved work — which is right
                  while styling, and misleading unless it admits it. Nobody
                  should have to remember that a preview and a published form
                  are different things.
                */}
                {dirty ? (
                  <>
                    <span style={{ fontSize: "0.82rem", color: "var(--primary, #f54900)" }}>
                      Not published yet
                    </span>
                    <button
                      type="button"
                      className={`${shell.btn} ${shell.btnPrimary}`}
                      disabled={pending}
                      onClick={save}
                    >
                      {pending ? "Saving…" : "Save & publish"}
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: "0.82rem", color: "var(--muted, #79808f)" }}>
                    This is what visitors see
                  </span>
                )}
                <button type="button" className={shell.btn} onClick={() => setPreviewOpen(false)}>
                  Close
                </button>
              </div>
            </header>

            {/* Styles */}
            <div style={{ overflowY: "auto", padding: "1rem", borderRight: "1px solid var(--line, #e6e8ee)" }}>
              <div style={{ marginBottom: "1.1rem" }}>
                <span style={smallLabel}>Container</span>
                <ColorRow
                  label="Background"
                  value={style["bg"] ?? ""}
                  onCommit={(v) => setToken("bg", v)}
                  onType={(v) => setStyle({ ...style, "bg": v })}
                />
                <PadRow
                  label="Padding"
                  value={style["pad"] ?? ""}
                  onCommit={(v) => setToken("pad", v)}
                />
                <TextRow
                  label="Corner radius"
                  unit="px"
                  value={style["radius"] ?? ""}
                  onType={(v) => setStyle({ ...style, "radius": v })}
                  onCommit={(v) => setToken("radius", v)}
                />
                <TextRow
                  label="Max width"
                  unit="px"
                  value={style["max"] ?? ""}
                  onType={(v) => setStyle({ ...style, "max": v })}
                  onCommit={(v) => setToken("max", v)}
                />
                <TextRow
                  label="Space between fields"
                  unit="px"
                  value={style["gap"] ?? ""}
                  onType={(v) => setStyle({ ...style, "gap": v })}
                  onCommit={(v) => setToken("gap", v)}
                />
              </div>

              <div style={{ marginBottom: "1.1rem" }}>
                <span style={smallLabel}>Labels</span>
                <TextRow
                  label="Size"
                  unit="px"
                  value={style["label-size"] ?? ""}
                  onType={(v) => setStyle({ ...style, "label-size": v })}
                  onCommit={(v) => setToken("label-size", v)}
                />
                <TextRow
                  label="Weight"
                  value={style["label-weight"] ?? ""}
                  onType={(v) => setStyle({ ...style, "label-weight": v })}
                  onCommit={(v) => setToken("label-weight", v)}
                />
                <ColorRow
                  label="Colour"
                  value={style["label"] ?? ""}
                  onCommit={(v) => setToken("label", v)}
                  onType={(v) => setStyle({ ...style, "label": v })}
                />
              </div>

              {hasTextInput && (
                <div style={{ marginBottom: "1.1rem" }}>
                  <span style={smallLabel}>Inputs</span>
                  <TextRow
                  label="Text size"
                  unit="px"
                  value={style["input-size"] ?? ""}
                  onType={(v) => setStyle({ ...style, "input-size": v })}
                  onCommit={(v) => setToken("input-size", v)}
                />
                  <PadRow
                  label="Padding"
                  value={style["input-pad"] ?? ""}
                  onCommit={(v) => setToken("input-pad", v)}
                />
                  <ColorRow
                  label="Border colour"
                  value={style["border"] ?? ""}
                  onCommit={(v) => setToken("border", v)}
                  onType={(v) => setStyle({ ...style, "border": v })}
                />
                  <ColorRow
                  label="Background"
                  value={style["input-bg"] ?? ""}
                  onCommit={(v) => setToken("input-bg", v)}
                  onType={(v) => setStyle({ ...style, "input-bg": v })}
                />
                  <TextRow
                  label="Placeholder size"
                  unit="px"
                  value={style["ph-size"] ?? ""}
                  onType={(v) => setStyle({ ...style, "ph-size": v })}
                  onCommit={(v) => setToken("ph-size", v)}
                />
                  <ColorRow
                  label="Placeholder colour"
                  value={style["ph-color"] ?? ""}
                  onCommit={(v) => setToken("ph-color", v)}
                  onType={(v) => setStyle({ ...style, "ph-color": v })}
                />
                </div>
              )}

              {types.has("textarea") && (
                <div style={{ marginBottom: "1.1rem" }}>
                  <span style={smallLabel}>Long text</span>
                  {/* Height only: everything else is shared with the inputs, and a
                      textarea that does not match the fields beside it looks broken. */}
                  <TextRow
                  label="Height"
                  unit="px"
                  value={style["textarea-height"] ?? ""}
                  onType={(v) => setStyle({ ...style, "textarea-height": v })}
                  onCommit={(v) => setToken("textarea-height", v)}
                />
                </div>
              )}

              <div style={{ marginBottom: "1.1rem" }}>
                <span style={smallLabel}>Button</span>
                <ColorRow
                  label="Background"
                  value={style["accent"] ?? ""}
                  onCommit={(v) => setToken("accent", v)}
                  onType={(v) => setStyle({ ...style, "accent": v })}
                />
                <ColorRow
                  label="Text colour"
                  value={style["accent-text"] ?? ""}
                  onCommit={(v) => setToken("accent-text", v)}
                  onType={(v) => setStyle({ ...style, "accent-text": v })}
                />
                <PadRow
                  label="Padding"
                  value={style["btn-pad"] ?? ""}
                  onCommit={(v) => setToken("btn-pad", v)}
                />
                <TextRow
                  label="Text size"
                  unit="px"
                  value={style["btn-size"] ?? ""}
                  onType={(v) => setStyle({ ...style, "btn-size": v })}
                  onCommit={(v) => setToken("btn-size", v)}
                />
                <TextRow
                  label="Label"
                  value={style["btn-label"] ?? ""}
                  onType={(v) => setStyle({ ...style, "btn-label": v })}
                  onCommit={(v) => setToken("btn-label", v)}
                />
              </div>

              <p style={{ fontSize: "0.74rem", color: "var(--muted, #79808f)" }}>
                Blank means &ldquo;inherit from the page it sits on&rdquo;. Save to keep these.
              </p>
            </div>

            {/*
              The real embed, in an iframe. Not a React copy: what is shown here
              is the form a visitor gets, restyled live by postMessage rather
              than reloaded on every keystroke.
            */}
            <iframe
              ref={frameRef}
              title="Form preview"
              src={`/forms/preview/${embedToken}`}
              onLoad={() => pushToPreview()}
              style={{ border: 0, width: "100%", height: "100%", background: "#fff" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
