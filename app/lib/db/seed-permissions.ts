/**
 * Seeds the fixed permission catalogue and the default role→permission
 * grants that match the app's behavior as of this migration — so turning
 * on enforcement doesn't change anyone's access until an admin edits it.
 * Safe to re-run. Run with: npx tsx lib/db/seed-permissions.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "./index";
import { permissions, rolePermissions } from "./schema";

const PERMISSIONS = [
  { key: "admin.access", label: "Access master admin", description: "Can open the platform admin dashboard at all.", category: "Platform" },
  { key: "agencies.manage", label: "Manage agencies", description: "Create agencies and assign owners.", category: "Platform" },
  { key: "agencies.view", label: "View agencies", description: "View the agency list and agency detail pages.", category: "Platform" },
  { key: "sites.view_all", label: "View all sites", description: "View every site across every agency and SMB account.", category: "Platform" },
  { key: "users.manage", label: "Manage users", description: "Create, edit, and deactivate user accounts.", category: "Platform" },
  { key: "ai_providers.manage", label: "Manage AI providers", description: "Configure the active AI provider and API keys.", category: "Platform" },
  { key: "impersonate.any", label: "View as any user", description: "Temporarily view the app as any agency or SMB account.", category: "Platform" },
  { key: "billing.manage", label: "Manage billing & plans", description: "Create and edit plan definitions on the Billing & Plans page.", category: "Platform" },
  { key: "settings.manage", label: "Manage platform settings", description: "Edit platform-wide settings.", category: "Platform" },
  { key: "activity.view", label: "View activity log", description: "View the platform-wide activity/audit log.", category: "Platform" },
  { key: "agencies.lifecycle", label: "Suspend, archive & delete agencies", description: "Suspend, archive, restore, or soft-delete an agency.", category: "Platform" },
  { key: "sections.manage", label: "Manage section library", description: "Create and edit the reusable page-building blocks available in the builder.", category: "Platform" },
  { key: "smtp.manage", label: "Manage SMTP settings", description: "Configure the platform's outbound email server.", category: "Platform" },
  { key: "sites.manage", label: "Create sites", description: "Create a new SMB/site directly from the admin, optionally assigned to an agency.", category: "Platform" },
  { key: "agency.team.manage", label: "Manage team", description: "Invite and manage team members on their agency.", category: "Agency" },
  { key: "agency.settings.manage", label: "Manage agency settings", description: "Edit the agency's own name and settings.", category: "Agency" },
  { key: "agency.sites.view", label: "View client sites", description: "View the agency's own client sites.", category: "Agency" },
  { key: "agency.impersonate_smb", label: "View as own SMB clients", description: "Temporarily view the app as one of their own client accounts.", category: "Agency" },
  { key: "agency.billing.manage", label: "Set client pricing", description: "Set what the agency charges its own SMB clients, per plan or per client.", category: "Agency" },
  { key: "smb.site.manage", label: "Manage own site", description: "Edit their own site's settings.", category: "SMB" },
  { key: "smb.leads.view", label: "View own leads", description: "View leads submitted on their own site.", category: "SMB" },
  { key: "smb.team.manage", label: "Manage site team", description: "Invite and manage team members on their own site.", category: "SMB" },
] as const;

const DEFAULT_GRANTS: Record<string, string[]> = {
  super_admin: [
    "admin.access",
    "agencies.manage",
    "agencies.view",
    "sites.view_all",
    "users.manage",
    "ai_providers.manage",
    "impersonate.any",
    "billing.manage",
    "settings.manage",
    "activity.view",
    "agencies.lifecycle",
    "sections.manage",
    "smtp.manage",
    "sites.manage",
  ],
  agency_owner: [
    "agency.team.manage",
    "agency.settings.manage",
    "agency.sites.view",
    "agency.impersonate_smb",
    "agency.billing.manage",
  ],
  agency_member: ["agency.sites.view"],
  smb_owner: ["smb.site.manage", "smb.leads.view", "smb.team.manage"],
  smb_member: ["smb.leads.view"],
};

async function main() {
  for (const p of PERMISSIONS) {
    await db.insert(permissions).values(p).onConflictDoNothing();
  }

  for (const [role, keys] of Object.entries(DEFAULT_GRANTS)) {
    for (const permissionKey of keys) {
      await db
        .insert(rolePermissions)
        .values({ role: role as never, permissionKey })
        .onConflictDoNothing();
    }
  }

  console.log("Permission catalogue seeded.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
