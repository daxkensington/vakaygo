/**
 * Simple iCal parser — no external dependencies.
 * Parses a VCALENDAR string and extracts VEVENT entries.
 * Handles DATE (YYYYMMDD) and DATE-TIME (YYYYMMDDTHHMMSSZ / YYYYMMDDTHHMMSS) formats.
 */

export type ICalEvent = {
  start: Date;
  end: Date;
  summary: string;
  uid: string;
};

/**
 * Parse an iCal DATE or DATE-TIME value into a JS Date.
 * Supports: 20260415, 20260415T120000Z, 20260415T120000
 */
function parseICalDate(value: string): Date {
  // Strip any TZID prefix (e.g. "TZID=America/New_York:")
  const cleaned = value.includes(":") ? value.split(":").pop()! : value;
  const trimmed = cleaned.trim();

  if (trimmed.length === 8) {
    // DATE format: YYYYMMDD
    const y = parseInt(trimmed.slice(0, 4), 10);
    const m = parseInt(trimmed.slice(4, 6), 10) - 1;
    const d = parseInt(trimmed.slice(6, 8), 10);
    return new Date(Date.UTC(y, m, d));
  }

  // DATE-TIME format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const match = trimmed.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/
  );
  if (match) {
    const [, yr, mo, dy, hr, mi, se] = match;
    return new Date(
      Date.UTC(
        parseInt(yr, 10),
        parseInt(mo, 10) - 1,
        parseInt(dy, 10),
        parseInt(hr, 10),
        parseInt(mi, 10),
        parseInt(se, 10)
      )
    );
  }

  // Fallback: try native parsing
  return new Date(trimmed);
}

/**
 * Unfold lines per RFC 5545 (lines can be split with CRLF + whitespace).
 */
function unfoldLines(text: string): string {
  return text.replace(/\r?\n[ \t]/g, "");
}

/**
 * Parse an iCal string and return an array of events.
 */
export function parseICal(icalText: string): ICalEvent[] {
  const unfolded = unfoldLines(icalText);
  const lines = unfolded.split(/\r?\n/);
  const events: ICalEvent[] = [];

  let inEvent = false;
  let current: Partial<ICalEvent> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }

    if (trimmed === "END:VEVENT") {
      inEvent = false;
      if (current.start && current.end) {
        events.push({
          start: current.start,
          end: current.end,
          summary: current.summary || "Blocked",
          uid: current.uid || "",
        });
      }
      continue;
    }

    if (!inEvent) continue;

    // Parse property;params:value — property name is before first ; or :
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const propPart = trimmed.slice(0, colonIdx);
    const value = trimmed.slice(colonIdx + 1);

    // Property name is before any ;params
    const propName = propPart.split(";")[0].toUpperCase();

    switch (propName) {
      case "DTSTART":
        current.start = parseICalDate(value);
        break;
      case "DTEND":
        current.end = parseICalDate(value);
        break;
      case "SUMMARY":
        current.summary = value;
        break;
      case "UID":
        current.uid = value;
        break;
    }
  }

  return events;
}

/**
 * Generate an iCal VCALENDAR string from events.
 */
export function generateICal(
  events: Array<{
    uid: string;
    start: Date;
    end: Date;
    summary: string;
    description?: string;
  }>
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VakayGo//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:VakayGo Bookings",
  ];

  for (const event of events) {
    const dtstart = formatICalDate(event.start);
    const dtend = formatICalDate(event.end);
    const now = formatICalDateTime(new Date());

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`);
    lines.push(`DTEND;VALUE=DATE:${dtend}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`SUMMARY:${escapeICalText(event.summary)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
    }
    lines.push("STATUS:CONFIRMED");
    lines.push("TRANSP:OPAQUE");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function formatICalDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatICalDateTime(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
