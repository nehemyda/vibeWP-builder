import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { rolePermissions } from "@/lib/db/schema";

type Role = "super_admin" | "agency_owner" | "agency_member" | "smb_owner" | "smb_member";

export async function hasPermission(role: Role, key: string): Promise<boolean> {
  const grant = await db.query.rolePermissions.findFirst({
    where: and(eq(rolePermissions.role, role), eq(rolePermissions.permissionKey, key)),
  });
  return !!grant;
}
