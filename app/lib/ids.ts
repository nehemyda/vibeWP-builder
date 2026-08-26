import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies, sites } from "@/lib/db/schema";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }
  return out;
}

/** Generates a unique 4-char partner code, e.g. "BRDL", "TG83". */
export async function generatePartnerId(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomCode(4);
    const existing = await db.query.agencies.findFirst({
      where: eq(agencies.partnerId, candidate),
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique partner ID after 20 attempts.");
}

/** Generates a unique SMB code, e.g. "AG-QV4RNHSF2T". */
export async function generateSmbId(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `AG-${randomCode(10)}`;
    const existing = await db.query.sites.findFirst({
      where: eq(sites.smbId, candidate),
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique SMB ID after 20 attempts.");
}
