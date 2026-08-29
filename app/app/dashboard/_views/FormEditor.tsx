"use client";

import { useState, useTransition } from "react";
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

export function FormEditor({
  smbId,
  formId,
  initial,
  backHref,
}: {
  smbId: string;
  formId: string;
  initial: { name: string; fields: FormFieldSpec[]; successMessage: string; notifyEmails: string };
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
  const [pending, start] = useTransition();

  const dirty =
    name !== initial.name ||
    successMessage !== initial.successMessage ||
    notifyEmails !== initial.notifyEmails ||
    JSON.stringify(fields) !== JSON.stringify(initial.fields);

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

  const active = selected !== null ? fields[selected] : undefined;

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
  const smallLabel: React.CSSProperties = {
    display: "block",
    fontSize: "0.72rem",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--muted, #79808f)",
    marginBottom: "0.3rem",
  };

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
          {saved && !dirty && (
            <span style={{ fontSize: "0.82rem", color: "var(--muted, #79808f)" }}>Saved</span>
          )}
          <button
            type="button"
            className={`${shell.btn} ${shell.btnPrimary}`}
            disabled={pending || !dirty}
            onClick={() =>
              start(async () => {
                const res = await saveFormAction({
                  smbId,
                  formId,
                  name,
                  fields,
                  successMessage,
                  notifyEmails,
                });
                if (res.ok) {
                  setSaved(true);
                  router.refresh();
                }
              })
            }
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
    </div>
  );
}
