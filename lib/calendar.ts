import { hasBookingTime, toWallClockDate } from "@/lib/booking-time";

function fmtDate(d: Date): string {
  return String(d.getUTCFullYear()).padStart(4, "0")
    + String(d.getUTCMonth() + 1).padStart(2, "0")
    + String(d.getUTCDate()).padStart(2, "0");
}

function fmtDateTime(d: Date): string {
  return fmtDate(d) + "T"
    + String(d.getUTCHours()).padStart(2, "0")
    + String(d.getUTCMinutes()).padStart(2, "0")
    + String(d.getUTCSeconds()).padStart(2, "0");
}

function resolve(startDate: string, endDate?: string): {
  start: string;
  end: string;
  allDay: boolean;
} {
  const start = toWallClockDate(startDate);
  if (Number.isNaN(start.getTime())) throw new RangeError("Invalid time value");

  const allDay = !hasBookingTime(start);
  const parsedEnd = endDate ? toWallClockDate(endDate) : undefined;
  const end = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : undefined;

  if (allDay) {
    const exclusiveEnd = new Date(
      (end && end.getTime() > start.getTime() ? end.getTime() : start.getTime()) + 86400000
    );
    return { start: fmtDate(start), end: fmtDate(exclusiveEnd), allDay };
  }

  return {
    start: fmtDateTime(start),
    end: fmtDateTime(end || new Date(start.getTime() + 3600000)),
    allDay,
  };
}

export function generateGoogleCalendarUrl(params: {
  title: string;
  startDate: string;
  endDate?: string;
  description?: string;
  location?: string;
}): string {
  const { title, startDate, endDate, description, location } = params;
  const { start, end } = resolve(startDate, endDate);

  const params2 = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details: description || `Booked on VakayGo — vakaygo.com`,
    location: location || "",
  });

  return `https://calendar.google.com/calendar/render?${params2}`;
}

export function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

export function generateICSFile(params: {
  title: string;
  startDate: string;
  endDate?: string;
  description?: string;
  location?: string;
}): string {
  const { title, startDate, endDate, description, location } = params;
  const { start, end, allDay } = resolve(startDate, endDate);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VakayGo//EN",
    "BEGIN:VEVENT",
    `DTSTART${allDay ? ";VALUE=DATE" : ""}:${start}`,
    `DTEND${allDay ? ";VALUE=DATE" : ""}:${end}`,
    `SUMMARY:${escapeICSText(title)}`,
    `DESCRIPTION:${escapeICSText(description || "Booked on VakayGo")}`,
    `LOCATION:${escapeICSText(location || "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
