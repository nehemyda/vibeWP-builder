/**
 * The one rule of nested impersonation, asserted.
 *
 * Run with `npx tsx lib/verify-impersonation.ts`, and as part of
 * `npm run verify`. No network, no cookies: the rule is a pure function.
 *
 * A super admin who opened an agency, then one of its clients, lost their own
 * session — the second hop backed up the agency owner instead. The fix is one
 * line; this makes sure the line stays.
 */
import { backupToKeep, type ImpersonationSession } from "./impersonation";

let fails = 0;
const fail = (m: string) => {
  console.log("  FAIL " + m);
  fails += 1;
};

const admin: ImpersonationSession = { accessToken: "a1", refreshToken: "r1", impersonatorId: "admin", impersonatorName: "Nehemiah C." };
const agencyOwner: ImpersonationSession = { accessToken: "a2", refreshToken: "r2", impersonatorId: "owner", impersonatorName: "Agency Owner" };

if (backupToKeep(null, admin) !== admin) fail("a first hop must back up the caller");
else console.log("  ok   first hop: the caller's own session is backed up");

if (backupToKeep(admin, agencyOwner) !== admin) fail("a second hop overwrote the real operator's session");
else console.log("  ok   second hop from inside an impersonation keeps the ORIGINAL operator");

if (backupToKeep(admin, agencyOwner).impersonatorId !== "admin") fail("audit attribution lost on the second hop");
else console.log("  ok   the audit trail still names the admin after two hops");

console.log(fails === 0 ? "\nRETURN ALWAYS LANDS ON THE REAL OPERATOR" : `\n${fails} FAILURE(S)`);
process.exitCode = fails === 0 ? 0 : 1;
