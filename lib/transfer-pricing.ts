export const TRANSFER_ROUND_TRIP_MULTIPLIER = 1.8;

export const TRANSFER_VEHICLE_TYPES = {
  sedan: { label: "Sedan", capacity: "1-3 passengers", multiplier: 1 },
  suv: { label: "SUV", capacity: "1-5 passengers", multiplier: 1.4 },
  minivan: { label: "Minivan", capacity: "1-7 passengers", multiplier: 1.7 },
  luxury: { label: "Luxury", capacity: "1-3 passengers", multiplier: 2.2 },
} as const;

export type TransferVehicleType = keyof typeof TRANSFER_VEHICLE_TYPES;

export function isTransferVehicleType(value: unknown): value is TransferVehicleType {
  return typeof value === "string" && Object.hasOwn(TRANSFER_VEHICLE_TYPES, value);
}

export function calculateTransferUnitPrice(basePrice: number, vehicleType: TransferVehicleType, roundTrip: boolean) {
  return Math.round(basePrice * TRANSFER_VEHICLE_TYPES[vehicleType].multiplier * (roundTrip ? TRANSFER_ROUND_TRIP_MULTIPLIER : 1) * 100) / 100;
}
