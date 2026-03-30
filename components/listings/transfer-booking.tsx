"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Plane, MapPin, Calendar, Users, Car, Check, Loader2, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/pricing";

type TransferBookingProps = {
  listingId: string;
  listingTitle: string;
  priceAmount: string | null;
  priceUnit: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeData: Record<string, any> | null;
};

const vehicleTypes = [
  { id: "sedan", label: "Sedan", capacity: "1-3 passengers", multiplier: 1.0 },
  { id: "suv", label: "SUV", capacity: "1-5 passengers", multiplier: 1.4 },
  { id: "minivan", label: "Minivan", capacity: "1-7 passengers", multiplier: 1.7 },
  { id: "luxury", label: "Luxury", capacity: "1-3 passengers", multiplier: 2.2 },
];

export function TransferBooking({ listingId, listingTitle, priceAmount, priceUnit, typeData }: TransferBookingProps) {
  const { user } = useAuth();
  const [pickup, setPickup] = useState("airport");
  const [dropoff, setDropoff] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [passengers, setPassengers] = useState(2);
  const [flightNumber, setFlightNumber] = useState("");
  const [vehicle, setVehicle] = useState("sedan");
  const [roundTrip, setRoundTrip] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);
  const [bookingNumber, setBookingNumber] = useState("");
  const [error, setError] = useState("");

  const basePrice = parseFloat(priceAmount || "30");
  const selectedVehicle = vehicleTypes.find(v => v.id === vehicle) || vehicleTypes[0];
  const price = basePrice * selectedVehicle.multiplier * (roundTrip ? 1.8 : 1);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { window.location.href = "/auth/signin"; return; }
    if (!date || !dropoff) { setError("Please fill all fields"); return; }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          startDate: `${date}T${time || "12:00"}:00`,
          guestCount: passengers,
          guestNotes: `Transfer: ${pickup === "airport" ? "Airport" : pickup} → ${dropoff} | Vehicle: ${selectedVehicle.label} | Flight: ${flightNumber || "N/A"} | ${roundTrip ? "Round trip" : "One way"}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      setBooked(true);
      setBookingNumber(data.booking.bookingNumber);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (booked) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)] text-center">
        <div className="w-14 h-14 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={28} className="text-white" />
        </div>
        <h3 className="text-xl font-bold text-navy-700">Transfer Booked!</h3>
        <p className="text-navy-400 mt-2">#{bookingNumber}</p>
        <p className="text-sm text-navy-500 mt-3">Your driver will meet you with a name sign.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
      <h3 className="font-bold text-navy-700 mb-1">Book This Transfer</h3>
      <p className="text-sm text-navy-400 mb-5">Fixed pricing — no surprises</p>

      <form onSubmit={handleBook} className="space-y-4">
        {/* Pickup */}
        <div className="border border-cream-300 rounded-xl p-3">
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Pickup</label>
          <div className="flex items-center gap-2 mt-1">
            <Plane size={16} className="text-navy-300" />
            <select value={pickup} onChange={e => setPickup(e.target.value)} className="w-full bg-transparent text-navy-700 outline-none text-sm appearance-none">
              <option value="airport">Airport</option>
              <option value="hotel">Hotel</option>
              <option value="port">Cruise Port</option>
              <option value="other">Other Location</option>
            </select>
          </div>
        </div>

        {/* Dropoff */}
        <div className="border border-cream-300 rounded-xl p-3">
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Dropoff</label>
          <div className="flex items-center gap-2 mt-1">
            <MapPin size={16} className="text-navy-300" />
            <input type="text" required value={dropoff} onChange={e => setDropoff(e.target.value)} placeholder="Hotel name or address" className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm" />
          </div>
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-cream-300 rounded-xl p-3">
            <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Date</label>
            <div className="flex items-center gap-2 mt-1">
              <Calendar size={16} className="text-navy-300" />
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-transparent text-navy-700 outline-none text-sm" />
            </div>
          </div>
          <div className="border border-cream-300 rounded-xl p-3">
            <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Time</label>
            <div className="flex items-center gap-2 mt-1">
              <ArrowRight size={16} className="text-navy-300" />
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full bg-transparent text-navy-700 outline-none text-sm" />
            </div>
          </div>
        </div>

        {/* Passengers + Flight */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-cream-300 rounded-xl p-3">
            <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Passengers</label>
            <div className="flex items-center gap-2 mt-1">
              <Users size={16} className="text-navy-300" />
              <select value={passengers} onChange={e => setPassengers(parseInt(e.target.value))} className="w-full bg-transparent text-navy-700 outline-none text-sm appearance-none">
                {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="border border-cream-300 rounded-xl p-3">
            <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Flight #</label>
            <div className="flex items-center gap-2 mt-1">
              <Plane size={16} className="text-navy-300" />
              <input type="text" value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="AA123" className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm" />
            </div>
          </div>
        </div>

        {/* Vehicle Selection */}
        <div>
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Vehicle</label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {vehicleTypes.map(v => (
              <button key={v.id} type="button" onClick={() => setVehicle(v.id)}
                className={`p-3 rounded-xl text-left transition-all ${vehicle === v.id ? "bg-navy-700 text-white" : "bg-cream-50 text-navy-600 hover:bg-cream-100"}`}>
                <div className="flex items-center gap-2">
                  <Car size={16} />
                  <span className="font-semibold text-sm">{v.label}</span>
                </div>
                <p className={`text-xs mt-1 ${vehicle === v.id ? "text-white/60" : "text-navy-400"}`}>{v.capacity}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Round Trip Toggle */}
        <label className="flex items-center gap-3 p-3 rounded-xl bg-cream-50 cursor-pointer">
          <input type="checkbox" checked={roundTrip} onChange={e => setRoundTrip(e.target.checked)} className="w-4 h-4 accent-gold-500" />
          <div>
            <p className="text-sm font-medium text-navy-700">Round trip</p>
            <p className="text-xs text-navy-400">Save 10% on the return journey</p>
          </div>
        </label>

        {/* Price */}
        <div className="p-4 bg-cream-50 rounded-xl">
          <div className="flex justify-between text-sm">
            <span className="text-navy-400">{selectedVehicle.label} {roundTrip ? "(round trip)" : "(one way)"}</span>
            <span className="font-bold text-navy-700">{formatCurrency(price)}</span>
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl">{error}</div>}

        <button type="submit" disabled={loading}
          className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold transition-all hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] flex items-center justify-center gap-2">
          {loading ? <Loader2 size={18} className="animate-spin" /> : `Book Transfer — ${formatCurrency(price)}`}
        </button>
      </form>
    </div>
  );
}
