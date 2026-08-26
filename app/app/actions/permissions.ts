"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { rolePermissions } from "@/lib/db/schema";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

const ROLES = ["super_admin", "agency_owner", "agency_member", "smb_owner"] as const;

/** Bound to <form action={updateRolePermissionsAction}> on /admin/users/permissions. */
export async function updateRolePermissionsAction(formData: FormData) {
  await requireSuperAdmin();

  const permissionKeys = formData.getAll("permissionKeys[]").map(String);

  // Full replace: delete every grant, then re-insert exactly what's checked.
  // Simpler and drift-free vs. diffing against current state.
  await db.delete(rolePermissions);

  const grants: { role: (typeof ROLES)[number]; permissionKey: string }[] = [];
  for (const role of ROLES) {
    for (const permissionKey of permissionKeys) {
      if (formData.get(`grant__${role}__${permissionKey}`) === "on") {
        grants.push({ role, permissionKey });
      }
    }
  }
  if (grants.length > 0) {
    await db.insert(rolePermissions).values(grants);
  }

  redirect("/admin/users/permissions?saved=1");
}
