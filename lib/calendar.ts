export function generateGoogleCalendarUrl(params: {
  title: string;
  startDate: string;
  endDate?: string;
  description?: string;
  location?: string;
}): string {
  const { title, startDate, endDate, description, location } = params;
  const start = new Date(startDate).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const end = endDate
    ? new Date(endDate).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
    : new Date(new Date(startDate).getTime() + 3600000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const params2 = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details: description || `Booked on VakayGo — vakaygo.com`,
    location: location || "",
  });

  return `https://calendar.google.com/calendar/render?${params2}`;
}

export function generateICSFile(params: {
  title: string;
  startDate: string;
  endDate?: string;
  description?: string;
  location?: string;
}): string {
  const { title, startDate, endDate, description, location } = params;
  const start = new Date(startDate).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const end = endDate
    ? new Date(endDate).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
    : new Date(new Date(startDate).getTime() + 3600000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VakayGo//EN",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${(description || "Booked on VakayGo").replace(/\n/g, "\\n")}`,
    `LOCATION:${location || ""}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
