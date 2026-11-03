/** Platform booking data does not establish a venue's visitor fees or current access. */
export type ConciergeVisitorFacts = {
  admission: "unconfirmed";
  currentAccess: "unconfirmed";
  openingHours: "unconfirmed";
  reservationRequirement: "unconfirmed";
  priceMeaning: "platform_booking_only";
};

/** Current tools have no independently verified, current visitor admission/access source. */
export function unconfirmedVisitorFacts(): ConciergeVisitorFacts {
  return {
    admission: "unconfirmed",
    currentAccess: "unconfirmed",
    openingHours: "unconfirmed",
    reservationRequirement: "unconfirmed",
    priceMeaning: "platform_booking_only",
  };
}
