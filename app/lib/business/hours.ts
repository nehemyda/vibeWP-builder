/**
 * Opening hours as a structured week.
 *
 * WHY NOT A TEXT FIELD
 *
 * "Mon–Fri 9–5, Sat 10–2" is one string a human can read and nothing else can.
 * A structured week is what lets the theme render a real table, lets us mark
 * today, and — the part that actually matters commercially — makes
 * schema.org LocalBusiness `openingHoursSpecification` possible. Google shows
 * opening hours in local results; a text blob cannot produce that markup.
 *
 * Kept deliberately simple: one open/close pair per day. Split hours (a
 * lunchtime close) are real for some trades and are NOT modelled here — that
 * needs a list of ranges per day, and adding it later is a change to this
 * type and its three call sites rather than a rewrite. Stated rather than
 * quietly wrong.
 */

export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Day = (typeof DAYS)[number];

export type DayHours = {
  day: Day;
  /** 24-hour "HH:MM". Ignored when `closed`. */
  open: string;
  close: string;
  closed: boolean;
};

export type OpeningHours = DayHours[];

export const DAY_LABELS: Record<Day, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** A sensible starting week: weekdays open, Saturday short, Sunday closed. */
export function defaultHours(): OpeningHours {
  return DAYS.map((day) => ({
    day,
    open: day === "saturday" ? "10:00" : "09:00",
    close: day === "saturday" ? "13:00" : "17:00",
    closed: day === "sunday",
  }));
}

/** Reads stored JSON back, filling anything missing rather than throwing. */
export function parseHours(stored: unknown): OpeningHours | null {
  if (!Array.isArray(stored)) return null;
  const byDay = new Map<string, Record<string, unknown>>();
  for (const entry of stored) {
    if (entry && typeof entry === "object" && typeof (entry as DayHours).day === "string") {
      byDay.set((entry as DayHours).day, entry as Record<string, unknown>);
    }
  }
  if (byDay.size === 0) return null;

  return DAYS.map((day) => {
    const row = byDay.get(day);
    return {
      day,
      open: isTime(row?.open) ? (row!.open as string) : "09:00",
      close: isTime(row?.close) ? (row!.close as string) : "17:00",
      closed: row?.closed === true,
    };
  });
}

function isTime(value: unknown): boolean {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * The week as one line per day, collapsing runs of identical days.
 *
 * "Monday to Friday: 9:00am – 5:00pm" rather than five separate lines, because
 * that is how a business writes its own hours and how a visitor reads them.
 */
export function formatHours(hours: OpeningHours): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < hours.length) {
    const start = hours[i];
    let end = i;
    while (
      end + 1 < hours.length &&
      sameHours(hours[end + 1], start)
    ) {
      end += 1;
    }

    const label =
      end === i
        ? DAY_LABELS[start.day]
        : `${DAY_LABELS[start.day]} to ${DAY_LABELS[hours[end].day]}`;

    out.push(`${label}: ${start.closed ? "Closed" : `${time12(start.open)} – ${time12(start.close)}`}`);
    i = end + 1;
  }

  return out;
}

function sameHours(a: DayHours, b: DayHours): boolean {
  if (a.closed !== b.closed) return false;
  return a.closed || (a.open === b.open && a.close === b.close);
}

/** "17:00" → "5:00pm". UK-facing copy, so no leading zero and a lowercase suffix. */
function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** Services are stored as objects so a description or price can be added later. */
export type ServiceEntry = { name: string };

export function parseServices(stored: unknown): ServiceEntry[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .map((s) => {
      if (typeof s === "string") return { name: s.trim() };
      if (s && typeof s === "object" && typeof (s as ServiceEntry).name === "string") {
        return { name: (s as ServiceEntry).name.trim() };
      }
      return { name: "" };
    })
    .filter((s) => s.name.length > 0);
}
