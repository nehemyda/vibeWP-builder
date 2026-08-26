import type { profiles } from "@/lib/db/schema";

type Role = (typeof profiles.$inferSelect)["role"];

/** Where a signed-in user lands once there's no in-flight build prompt to act on. */
export function roleHomePath(role: Role): string {
  switch (role) {
    case "super_admin":
      return "/admin";
    case "agency_owner":
    case "agency_member":
      return "/agency";
    case "smb_owner":
    case "smb_member":
    default:
      return "/dashboard";
  }
}
