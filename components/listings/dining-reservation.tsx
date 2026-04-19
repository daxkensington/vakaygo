"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Calendar, Clock, Users, Check, Loader2 } from "lucide-react";

type DiningReservationProps = {
  listingId: string;
  listingTitle: string;
  operatorId: string;
};

const timeSlots = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
  "20:00", "20:30", "21:00",
];

export function DiningReservation({ listingId, listingTitle, operatorId }: DiningReservationProps) {
  const { user } = useAuth();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [guests, setGuests] = useState(2);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [reserved, setReserved] = useState(false);
  const [bookingNumber, setBookingNumber] = useState("");
  const [error, setError] = useState("");

  async function handleReserve(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time) {
      setError("Please select a date and time");
      return;
    }
    if (!user) {
      window.location.href = "/auth/signin";
      return;
    }

    setError("");
    setLoading(true);

    try {
      const dateTime = `${date}T${time}:00`;
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          startDate: dateTime,
          guestCount: guests,
          guestNotes: notes || `Reservation for ${guests} at ${time}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reserve");
        return;
      }

      setReserved(true);
      setBookingNumber(data.booking.bookingNumber);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (reserved) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)] text-center">
        <div className="w-14 h-14 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check size={28} className="text-white" />
        </div>
        <h3 className="text-xl font-bold text-navy-700">Reservation Confirmed!</h3>
        <p className="text-navy-400 mt-2">#{bookingNumber}</p>
        <div className="mt-4 p-4 bg-cream-50 rounded-xl text-sm text-navy-600">
          <p>{listingTitle}</p>
          <p className="mt-1">{new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {time}</p>
          <p className="mt-1">{guests} guest{guests > 1 ? "s" : ""}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-elevated)]">
      <h3 className="font-bold text-navy-700 mb-1">Make a Reservation</h3>
      <p className="text-sm text-navy-400 mb-5">No cover fees — free to book</p>

      <form onSubmit={handleReserve} className="space-y-4">
        {/* Date */}
        <div className="border border-cream-300 rounded-xl p-3 focus-within:border-gold-500 transition-colors">
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Date</label>
          <div className="flex items-center gap-2 mt-1">
            <Calendar size={16} className="text-navy-300" />
            <input
              type="date"
              required
              aria-label="Reservation date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full bg-transparent text-navy-700 outline-none text-sm"
            />
          </div>
        </div>

        {/* Time */}
        <div className="border border-cream-300 rounded-xl p-3 focus-within:border-gold-500 transition-colors">
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Time</label>
          <div className="flex items-center gap-2 mt-1">
            <Clock size={16} className="text-navy-300" />
            <select
              required
              aria-label="Reservation time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-transparent text-navy-700 outline-none text-sm appearance-none cursor-pointer"
            >
              <option value="">Select a time</option>
              <optgroup label="Lunch">
                {timeSlots.filter(t => parseInt(t) < 15).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </optgroup>
              <optgroup label="Dinner">
                {timeSlots.filter(t => parseInt(t) >= 15).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Party Size */}
        <div className="border border-cream-300 rounded-xl p-3 focus-within:border-gold-500 transition-colors">
          <label className="text-[11px] font-semibold text-navy-400 uppercase tracking-wider">Party Size</label>
          <div className="flex items-center gap-2 mt-1">
            <Users size={16} className="text-navy-300" />
            <select
              aria-label="Party size"
              value={guests}
              onChange={(e) => setGuests(parseInt(e.target.value))}
              className="w-full bg-transparent text-navy-700 outline-none text-sm appearance-none cursor-pointer"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map(n => (
                <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Special Requests */}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Special requests (allergies, celebrations, high chair...)"
          className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none text-sm resize-none"
        />

        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold transition-all hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : "Reserve a Table"}
        </button>

        <p className="text-center text-navy-300 text-xs">
          Free reservation — no cover fees on VakayGo
        </p>
      </form>
    </div>
  );
}
