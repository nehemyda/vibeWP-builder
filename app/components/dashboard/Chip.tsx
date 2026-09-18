/**
 * A small outlined label that sits beside something, not on its own line.
 *
 * Extracted when a second one was needed in the same cell: the "Your site"
 * marker carried its styling as an inline object, and a mode label pasted
 * beside it would have been the same eight declarations written twice, in one
 * row, free to drift apart.
 *
 * Deliberately not the same thing as `shell.pill`, which is the status badge —
 * those are filled and coloured by meaning (Live, Draft, Trial). A chip is
 * quieter than the text it annotates.
 */
export function Chip({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      style={{
        marginLeft: "0.5rem",
        padding: "0.1rem 0.4rem",
        borderRadius: 999,
        border: "1px solid var(--line, #dbdee3)",
        fontSize: "0.68rem",
        fontWeight: 600,
        color: "var(--muted, #79808f)",
        verticalAlign: "middle",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
