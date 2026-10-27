"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { analytics } from "@/lib/analytics";
import { useRouter } from "next/navigation";
import { Plane, MapPin, Calendar, Users, Car, Check, Loader2, ArrowRight, Shield } from "lucide-react";
import { formatCurrency } from "@/lib/pricing";
import { calculateTransferUnitPrice, TRANSFER_VEHICLE_TYPES, type TransferVehicleType } from "@/lib/transfer-pricing";
import { BookingEligibilityGate, invalidateBookingControls } from "./booking-eligibility";

type TransferBookingProps = {
  listingId: string;
  listingTitle: string;
  priceAmount: string | null;
  priceCurrency?: string | null;
  priceUnit: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeData: Record<string, any> | null;
  /** Listing built from public data — the operator cannot see bookings. */
  unclaimed?: boolean;
  bookingEligible?: boolean;
  operatorId?: string;
};

const vehicleTypes = (Object.keys(TRANSFER_VEHICLE_TYPES) as TransferVehicleType[]).map(id => ({
  id,
  ...TRANSFER_VEHICLE_TYPES[id],
}));

export function TransferBooking(props: TransferBookingProps) {
  return <BookingEligibilityGate bookingEligible={props.bookingEligible} listingId={props.listingId} operatorId={props.operatorId} unclaimed={props.unclaimed}>
    <EligibleTransferBooking {...props} />
  </BookingEligibilityGate>;
}

function EligibleTransferBooking({ listingId, priceAmount, priceCurrency, unclaimed = false }: TransferBookingProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [pickup, setPickup] = useState("airport");
  const [dropoff, setDropoff] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [passengers, setPassengers] = useState(2);
  const [flightNumber, setFlightNumber] = useState("");
  const [vehicle, setVehicle] = useState<TransferVehicleType>("sedan");
  const [roundTrip, setRoundTrip] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booked, setBooked] = useState(false);
  const [requested, setRequested] = useState(false);
  const [payLater, setPayLater] = useState(false);
  const [paymentStep, setPaymentStep] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [bookingNumber, setBookingNumber] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);
  const [error, setError] = useState("");

  // No listing price ⇒ we cannot quote. The old default of "30" showed a
  // made-up fare on 473 of 500 transfer listings.
  const hasPrice = !!priceAmount && parseFloat(priceAmount) > 0;
  const basePrice = hasPrice ? parseFloat(priceAmount as string) : 0;
  const selectedVehicle = TRANSFER_VEHICLE_TYPES[vehicle];
  const price = calculateTransferUnitPrice(basePrice, vehicle, roundTrip);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { router.push("/auth/signin"); return; }
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
          vehicleType: vehicle,
          roundTrip,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === "BOOKING_UNAVAILABLE") invalidateBookingControls(listingId);
        setError(data.error || "Failed");
        return;
      }
      setBookingNumber(data.booking.bookingNumber);
      if (data.mode === "request" || data.booking?.status === "requested") {
        if (typeof data.booking?.id === "string" && data.booking.id.trim()) {
          analytics.bookingRequestSaved({ listingId, listingType: "transfer" });
        }
        setRequested(true);
        setBooked(true);
        return;
      }
      setBookingId(data.booking.id);
      setTotalAmount(Number(data.booking.totalAmount));
      setPaymentStep(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handlePayNow() {
    setPaymentLoading(true);
    setError("");
    try {
      const res = await fetch("/api/payments/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.url !== "string") {
        invalidateBookingControls(listingId);
        setError(data.error || "Payment setup failed");
        return;
      }
      try {
        const checkoutUrl = new URL(data.url);
        if (checkoutUrl.protocol === "https:" && checkoutUrl.hostname === "checkout.stripe.com" && !checkoutUrl.username && !checkoutUrl.password) {
          analytics.startCheckout({ listingId, listingType: "transfer" });
        }
      } catch { /* A malformed receipt must not become a checkout event. */ }
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPaymentLoading(false);
    }
  }

  if (paymentStep) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)] text-center">
        <div className="w-14 h-14 bg-gold-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield size={28} className="text-white" />
        </div>
        <h3 className="text-xl font-bold text-navy-700">Complete Your Booking</h3>
        <p className="text-navy-400 mt-2">Booking #{bookingNumber}</p>
        <p className="text-lg font-semibold text-navy-700 mt-4">Total: {formatCurrency(totalAmount, priceCurrency || "USD")}</p>
        {error && <div role="alert" className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl mt-4">{error}</div>}
        <button onClick={handlePayNow} disabled={paymentLoading} className="w-full mt-6 bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2">
          {paymentLoading ? <Loader2 size={18} className="animate-spin" /> : <><Shield size={18} />Pay Now</>}
        </button>
        <button onClick={() => { setPaymentStep(false); setPayLater(true); setBooked(true); }} disabled={paymentLoading} className="w-full mt-3 text-navy-400 hover:text-navy-600 py-3 rounded-xl font-medium text-sm">
          Pay Later
        </button>
        <p className="text-center text-navy-300 text-xs mt-3">Secure checkout powered by Stripe</p>
      </div>
    );
  }

  if (booked) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)] text-center">
        <div className="w-14 h-14 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={28} className="text-white" />
        </div>
        <h3 className="text-xl font-bold text-navy-700">{requested ? "Request received" : "Booking received"}</h3>
        <p className="text-navy-400 mt-2">#{bookingNumber}</p>
        {requested ? (
          <p className="text-sm text-navy-500 mt-3">Nothing is confirmed or charged yet. We&apos;ll confirm availability and the exact price with the operator and email you, usually within 24 hours.</p>
        ) : payLater ? (
          <p className="text-sm text-navy-500 mt-3 leading-relaxed">
            <strong>Not confirmed until paid.</strong> Complete payment from <Link href="/bookings" className="text-gold-700 font-semibold">My Bookings</Link> while checkout is open. Unpaid bookings expire after 48 hours; checkout links can close sooner.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
      <h3 className="font-bold text-navy-700 mb-1">{unclaimed ? "Request This Transfer" : "Book This Transfer"}</h3>
      <p className="text-sm text-navy-400 mb-5">
        {unclaimed ? "Price confirmed with the operator before anything is charged" : "Fixed pricing — no surprises"}
      </p>

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
            <span className="font-bold text-navy-700">{hasPrice && !unclaimed ? formatCurrency(price, priceCurrency || "USD") : "Quoted by the operator"}</span>
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl">{error}</div>}

        <button type="submit" disabled={loading}
          className="w-full bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold transition-all hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] flex items-center justify-center gap-2">
          {loading ? <Loader2 size={18} className="animate-spin" /> : hasPrice && !unclaimed ? `Book Transfer — ${formatCurrency(price, priceCurrency || "USD")}` : "Request Transfer"}
        </button>
      </form>
    </div>
  );
}
