/**
 * Practical facts per destination, keyed by island slug. One source for the
 * island hub's "essentials" strip and for the FAQ answers on the
 * things-to-do / best-hotels / best-restaurants hubs, so a destination never
 * gets another region's seasons or currency.
 *
 * Only add a fact here when it is true for that destination. A destination
 * without an entry gets no season or currency statement at all.
 */
export type DestinationEssentials = {
  currency: string;
  language: string;
  bestTime: string;
  airport: string;
  driving: string;
};

export const DESTINATION_ESSENTIALS: Record<string, DestinationEssentials> = {
  grenada: { currency: "EC$ (XCD) / USD", language: "English", bestTime: "Dec – May", airport: "GND (Maurice Bishop)", driving: "Left side" },
  barbados: { currency: "BDS$ (BBD) / USD", language: "English", bestTime: "Dec – Apr", airport: "BGI (Grantley Adams)", driving: "Left side" },
  jamaica: { currency: "J$ (JMD) / USD", language: "English / Patois", bestTime: "Nov – Apr", airport: "MBJ / KIN", driving: "Left side" },
  "st-lucia": { currency: "EC$ (XCD) / USD", language: "English / Kwéyòl", bestTime: "Dec – May", airport: "UVF (Hewanorra)", driving: "Left side" },
  "trinidad-and-tobago": { currency: "TT$ (TTD) / USD", language: "English", bestTime: "Jan – May", airport: "POS / TAB", driving: "Left side" },
  bahamas: { currency: "B$ (BSD) / USD", language: "English", bestTime: "Nov – Apr", airport: "NAS (Lynden Pindling)", driving: "Left side" },
  antigua: { currency: "EC$ (XCD) / USD", language: "English", bestTime: "Dec – Apr", airport: "ANU (V.C. Bird)", driving: "Left side" },
  aruba: { currency: "AWG / USD", language: "Dutch / Papiamento / EN", bestTime: "Year-round", airport: "AUA (Queen Beatrix)", driving: "Right side" },
  curacao: { currency: "XCG / USD", language: "Dutch / Papiamento / EN", bestTime: "Year-round", airport: "CUR (Hato Intl)", driving: "Right side" },
  "dominican-republic": { currency: "RD$ (DOP) / USD", language: "Spanish / English", bestTime: "Dec – Apr", airport: "PUJ / SDQ", driving: "Right side" },
  "turks-and-caicos": { currency: "USD ($)", language: "English", bestTime: "Dec – May", airport: "PLS (Providenciales)", driving: "Left side" },
  "cayman-islands": { currency: "CI$ (KYD) / USD", language: "English", bestTime: "Nov – Apr", airport: "GCM (Owen Roberts)", driving: "Left side" },
  "puerto-rico": { currency: "USD ($)", language: "Spanish / English", bestTime: "Dec – Apr", airport: "SJU (Luis Muñoz Marín)", driving: "Right side" },
  guadeloupe: { currency: "EUR (€)", language: "French / Creole", bestTime: "Dec – May", airport: "PTP (Pointe-à-Pitre)", driving: "Right side" },
  martinique: { currency: "EUR (€)", language: "French / Creole", bestTime: "Dec – May", airport: "FDF (Aimé Césaire)", driving: "Right side" },
  "us-virgin-islands": { currency: "USD ($)", language: "English", bestTime: "Dec – May", airport: "STT (Cyril E. King)", driving: "Left side" },
  "british-virgin-islands": { currency: "USD ($)", language: "English", bestTime: "Dec – May", airport: "EIS (Terrance B. Lettsome)", driving: "Left side" },
  bonaire: { currency: "USD ($)", language: "Dutch / Papiamentu / EN", bestTime: "Year-round", airport: "BON (Flamingo Intl)", driving: "Right side" },
  "st-vincent": { currency: "EC$ (XCD) / USD", language: "English", bestTime: "Dec – May", airport: "SVD (Argyle Intl)", driving: "Left side" },
  "st-kitts": { currency: "EC$ (XCD) / USD", language: "English", bestTime: "Dec – May", airport: "SKB (Robert L. Bradshaw)", driving: "Left side" },
  dominica: { currency: "EC$ (XCD) / USD", language: "English / Kwéyòl", bestTime: "Dec – May", airport: "DOM (Douglas-Charles)", driving: "Left side" },
  // Wave 2A — Latin America
  cartagena: { currency: "COP ($) / USD", language: "Spanish / English", bestTime: "Dec – Apr", airport: "CTG (Rafael Núñez)", driving: "Right side" },
  medellin: { currency: "COP ($) / USD", language: "Spanish / English", bestTime: "Year-round", airport: "MDE (José María Córdova)", driving: "Right side" },
  "cancun-riviera-maya": { currency: "MXN ($) / USD", language: "Spanish / English", bestTime: "Nov – Apr", airport: "CUN / TQO", driving: "Right side" },
  "los-cabos": { currency: "MXN ($) / USD", language: "Spanish / English", bestTime: "Nov – May", airport: "SJD (Los Cabos Intl)", driving: "Right side" },
  guanacaste: { currency: "CRC (₡) / USD", language: "Spanish / English", bestTime: "Dec – Apr", airport: "LIR (Guanacaste Intl)", driving: "Right side" },
  "ambergris-caye": { currency: "BZD ($) / USD", language: "English / Spanish", bestTime: "Nov – May", airport: "BZE / SPR", driving: "Right side (Golf Carts)" },
  // Wave 2B — Mediterranean
  santorini: { currency: "EUR (€)", language: "Greek / English", bestTime: "May – Oct", airport: "JTR (Santorini Intl)", driving: "Right side" },
  mykonos: { currency: "EUR (€)", language: "Greek / English", bestTime: "May – Oct", airport: "JMK (Mykonos Intl)", driving: "Right side" },
  crete: { currency: "EUR (€)", language: "Greek / English", bestTime: "Apr – Oct", airport: "HER / CHQ", driving: "Right side" },
  ibiza: { currency: "EUR (€)", language: "Spanish / Catalan / EN", bestTime: "May – Oct", airport: "IBZ (Ibiza Airport)", driving: "Right side" },
  mallorca: { currency: "EUR (€)", language: "Spanish / Catalan / EN", bestTime: "Apr – Oct", airport: "PMI (Palma de Mallorca)", driving: "Right side" },
  "amalfi-coast-capri": { currency: "EUR (€)", language: "Italian / English", bestTime: "May – Oct", airport: "NAP (Naples Intl)", driving: "Right side" },
  "hvar-split": { currency: "EUR (€)", language: "Croatian / English", bestTime: "May – Oct", airport: "SPU (Split Airport)", driving: "Right side" },
};

/** Shown on an island hub that has no entry yet. Not used for FAQ answers. */
export const DEFAULT_DESTINATION_ESSENTIALS: DestinationEssentials = {
  currency: "USD & Local Currency",
  language: "English / Local",
  bestTime: "Dec – May",
  airport: "International Airport",
  driving: "Local permit / Check side",
};

export function getDestinationEssentials(slug: string): DestinationEssentials | null {
  return Object.prototype.hasOwnProperty.call(DESTINATION_ESSENTIALS, slug)
    ? DESTINATION_ESSENTIALS[slug]
    : null;
}

const MONTHS: Record<string, string> = {
  Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June",
  Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December",
};

/**
 * The months a destination is most visited, in prose ("December to April"),
 * or null when it has no single season (year-round) or no entry.
 */
export function popularMonths(slug: string): string | null {
  const range = getDestinationEssentials(slug)?.bestTime.match(/^([A-Z][a-z]{2}) – ([A-Z][a-z]{2})$/);
  if (!range || !MONTHS[range[1]] || !MONTHS[range[2]]) return null;
  return `${MONTHS[range[1]]} to ${MONTHS[range[2]]}`;
}

export function isYearRoundDestination(slug: string): boolean {
  return getDestinationEssentials(slug)?.bestTime === "Year-round";
}

/** The local currency label without the "/ USD" also-accepted suffix. */
export function localCurrency(slug: string): string | null {
  const currency = getDestinationEssentials(slug)?.currency;
  return currency ? currency.split(" / ")[0].trim() : null;
}

/** "left" | "right", or null when unknown. */
export function drivingSide(slug: string): "left" | "right" | null {
  const driving = getDestinationEssentials(slug)?.driving;
  if (!driving) return null;
  if (driving.startsWith("Left")) return "left";
  if (driving.startsWith("Right")) return "right";
  return null;
}
