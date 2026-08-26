import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { createSectionAction, updateSectionAction } from "@/app/actions/sections";
import shell from "@/components/dashboard/dashboard-shell.module.css";
import { ADMIN_NAV } from "../nav";

const inputStyle = {
  width: "100%",
  padding: "0.6rem 0.8rem",
  borderRadius: 10,
  border: "1px solid var(--line)",
  fontSize: "0.87rem",
} as const;
const labelStyle = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 600,
  marginBottom: "0.35rem",
  color: "var(--muted)",
} as const;

export default async function AdminSectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile } = await requireRole(["super_admin"]);
  const { saved } = await searchParams;

  const allSections = await db.query.sections.findMany();
  const sorted = allSections.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <DashboardShell
      navGroups={ADMIN_NAV}
      activeHref="/admin/sections"
      userName={profile.fullName}
      userRole="Super admin"
      title="Section library"
      subtitle="Reusable page-building blocks available in the builder — platform-wide, managed only here."
    >
      {saved && (
        <div className={shell.panel} style={{ padding: "1rem", marginBottom: "1.2rem", color: "var(--good)" }}>
          Saved.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1rem",
          marginBottom: "1.2rem",
        }}
      >
        {sorted.map((section) => (
          <div key={section.id} className={shell.panel} style={{ padding: "1.3rem" }}>
            <form action={updateSectionAction} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <input type="hidden" name="sectionId" value={section.id} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className={shell.idBadge}>{section.key}</span>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}>
                  <input type="checkbox" name="isActive" defaultChecked={section.isActive} />
                  Active
                </label>
              </div>
              <div>
                <label style={labelStyle}>Name</label>
                <input name="name" defaultValue={section.name} required style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={section.description ?? ""}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                <div>
                  <label style={labelStyle}>Category</label>
                  <input name="category" defaultValue={section.category} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Component type</label>
                  <input name="componentType" defaultValue={section.componentType} required style={inputStyle} />
                </div>
              </div>
              <button type="submit" className={`${shell.btn} ${shell.btnPrimary}`}>
                Save {section.name}
              </button>
            </form>
          </div>
        ))}
      </div>

      <div className={shell.panel} style={{ padding: "1.3rem", maxWidth: 420 }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Add a section</h2>
        <form action={createSectionAction} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <div>
            <label style={labelStyle}>Key (internal, unique)</label>
            <input name="key" required placeholder="testimonial-grid" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Name</label>
            <input name="name" required placeholder="Testimonial Grid" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Component type</label>
            <input name="componentType" required placeholder="TestimonialGrid" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <input name="category" defaultValue="General" style={inputStyle} />
          </div>
          <button type="submit" className={shell.btn}>
            Create section
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
