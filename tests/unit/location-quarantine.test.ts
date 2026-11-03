import { expect, it } from "vitest";
import { isQuarantinedLocation } from "@/server/location-quarantine";

const observed = {
  id: "500af6ce-7cca-4e01-be27-8d92e5ec4d96",
  latitude: "12.1400463", longitude: "-61.1895325",
};

it("withholds the observed record only while both coordinates match", () => {
  expect(isQuarantinedLocation(observed)).toBe(true);
  expect(isQuarantinedLocation({ ...observed, latitude: 12.1400463, longitude: -61.1895325 })).toBe(true);
  expect(isQuarantinedLocation({ ...observed, id: "82000000-0000-4000-8000-000000000001" })).toBe(false);
  expect(isQuarantinedLocation({ ...observed, latitude: "12.0556930" })).toBe(false);
  expect(isQuarantinedLocation({ ...observed, longitude: "-61.6336657" })).toBe(false);
  expect(isQuarantinedLocation({ ...observed, latitude: null })).toBe(false);
});
