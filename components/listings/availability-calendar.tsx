"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Save,
  Loader2,
  Ban,
  Lock,
  Unlock,
} from "lucide-react";

type AvailabilityDay = {
  date: string;
  spots: number | null;
  spotsRemaining: number | null;
  priceOverride: string | null;
  isBlocked: boolean | null;
};

type Props = {
  listingId: string;
  onDateSelect?: (date: string) => void;
  mode?: "view" | "manage";
};

type PopoverData = {
  date: string;
  spots: string;
  priceOverride: string;
  isBlocked: boolean;
};

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function AvailabilityCalendar({ listingId, onDateSelect, mode = "view" }: Props) {
  const today = new Date();
  const todayStr = toDateString(today.getFullYear(), today.getMonth(), today.getDate());

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, AvailabilityDay>>({});
  const [bookingsMap, setBookingsMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Manage mode state
  const [popover, setPopover] = useState<PopoverData | null>(null);
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Bulk block mode
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkDates, setBulkDates] = useState<Set<string>>(new Set());

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const monthStr = formatMonth(year, month);
      const res = await fetch(
        `/api/availability?listingId=${listingId}&month=${monthStr}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      const map: Record<string, AvailabilityDay> = {};
      for (const a of data.availability) {
        map[a.date] = a;
      }
      setAvailabilityMap(map);
      setBookingsMap(data.bookings || {});
    } catch (err) {
      console.error("Failed to load availability:", err);
    } finally {
      setLoading(false);
    }
  }, [listingId, year, month]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
    setPopover(null);
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
    setPopover(null);
  }

  function handleDateClick(dateStr: string, isPast: boolean) {
    if (isPast) return;

    if (bulkMode) {
      setBulkDates((prev) => {
        const next = new Set(prev);
        if (next.has(dateStr)) {
          next.delete(dateStr);
        } else {
          next.add(dateStr);
        }
        return next;
      });
      return;
    }

    if (mode === "manage") {
      const existing = availabilityMap[dateStr];
      setPopover({
        date: dateStr,
        spots: existing?.spots?.toString() || "",
        priceOverride: existing?.priceOverride?.toString() || "",
        isBlocked: existing?.isBlocked || false,
      });
    } else {
      setSelectedDate(dateStr);
      onDateSelect?.(dateStr);
    }
  }

  async function savePopover() {
    if (!popover) return;
    setSaving(true);
    try {
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          dates: [
            {
              date: popover.date,
              spots: popover.spots ? parseInt(popover.spots) : null,
              priceOverride: popover.priceOverride || null,
              isBlocked: popover.isBlocked,
            },
          ],
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setPopover(null);
      await fetchAvailability();
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  }

  async function bulkBlock() {
    if (bulkDates.size === 0) return;
    setSaving(true);
    try {
      const dates = Array.from(bulkDates).map((d) => ({
        date: d,
        isBlocked: true,
        spots: null as number | null,
        priceOverride: null as string | null,
      }));
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, dates }),
      });
      if (!res.ok) throw new Error("Failed to block dates");
      setBulkDates(new Set());
      setBulkMode(false);
      await fetchAvailability();
    } catch (err) {
      console.error("Bulk block error:", err);
    } finally {
      setSaving(false);
    }
  }

  // Build calendar grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells: Array<{ day: number; dateStr: string } | null> = [];

  for (let i = 0; i < firstDay; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: toDateString(year, month, d) });
  }

  return (
    <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 rounded-xl hover:bg-cream-100 text-navy-500 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} />
        </button>
        <h3 className="text-lg font-semibold text-navy-700">
          {MONTH_NAMES[month]} {year}
        </h3>
        <button
          onClick={nextMonth}
          className="p-2 rounded-xl hover:bg-cream-100 text-navy-500 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Bulk mode toggle for manage */}
      {mode === "manage" && (
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              setBulkMode(!bulkMode);
              setBulkDates(new Set());
              setPopover(null);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              bulkMode
                ? "bg-red-50 text-red-600"
                : "bg-cream-100 text-navy-500 hover:bg-cream-200"
            }`}
          >
            <Ban size={14} />
            {bulkMode ? "Cancel Bulk Select" : "Block Dates"}
          </button>
          {bulkMode && bulkDates.size > 0 && (
            <button
              onClick={bulkBlock}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              Block {bulkDates.size} Date{bulkDates.size > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-semibold text-navy-400 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
            <Loader2 size={24} className="animate-spin text-gold-500" />
          </div>
        )}

        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }

          const { day, dateStr } = cell;
          const avail = availabilityMap[dateStr];
          const bookingCount = bookingsMap[dateStr] || 0;
          const isPast = dateStr < todayStr;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const isBlocked = avail?.isBlocked;
          const hasAvailability = avail && !isBlocked;
          const isBulkSelected = bulkDates.has(dateStr);

          let bgClass = "bg-white hover:bg-cream-50";
          let textClass = "text-navy-700";

          if (isPast) {
            bgClass = "bg-cream-50";
            textClass = "text-navy-200";
          } else if (isBulkSelected) {
            bgClass = "bg-red-100 ring-2 ring-red-400";
            textClass = "text-red-700";
          } else if (isBlocked) {
            bgClass = "bg-cream-200";
            textClass = "text-navy-300 line-through";
          } else if (isSelected) {
            bgClass = "bg-gold-500";
            textClass = "text-white";
          } else if (hasAvailability) {
            bgClass = "bg-teal-50 hover:bg-teal-100";
            textClass = "text-teal-700";
          }

          if (isToday && !isSelected && !isBulkSelected) {
            bgClass += " ring-2 ring-gold-400";
          }

          return (
            <button
              key={dateStr}
              onClick={() => handleDateClick(dateStr, isPast)}
              disabled={isPast && !bulkMode}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-all relative ${bgClass} ${textClass} ${
                isPast ? "cursor-default" : "cursor-pointer"
              }`}
            >
              <span className={`font-medium ${isBlocked && !isPast ? "line-through" : ""}`}>
                {day}
              </span>

              {/* Price override */}
              {avail?.priceOverride && !isPast && !isBlocked && (
                <span className="text-[10px] font-semibold text-gold-700 leading-tight">
                  ${parseFloat(avail.priceOverride).toFixed(0)}
                </span>
              )}

              {/* Spots remaining */}
              {avail?.spotsRemaining != null && !isPast && !isBlocked && (
                <span className="text-[9px] text-teal-500 leading-tight">
                  {avail.spotsRemaining} left
                </span>
              )}

              {/* Booking indicator */}
              {bookingCount > 0 && !isPast && (
                <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-gold-500 rounded-full" />
              )}

              {/* Blocked icon */}
              {isBlocked && !isPast && (
                <Lock size={10} className="text-navy-300 mt-0.5" />
              )}
            </button>
          );
        })}

        {/* Popover for manage mode */}
        {popover && mode === "manage" && (
          <div
            ref={popoverRef}
            className="absolute z-20 bg-white rounded-2xl shadow-[var(--shadow-elevated)] p-4 w-64 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-navy-700">
                {popover.date}
              </h4>
              <button
                onClick={() => setPopover(null)}
                className="text-navy-400 hover:text-navy-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Spots */}
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">
                  Available Spots
                </label>
                <input
                  type="number"
                  min="0"
                  value={popover.spots}
                  onChange={(e) =>
                    setPopover({ ...popover, spots: e.target.value })
                  }
                  placeholder="Unlimited"
                  className="w-full px-3 py-1.5 rounded-lg border border-cream-300 text-sm text-navy-700 focus:ring-2 focus:ring-gold-400 focus:border-transparent outline-none"
                />
              </div>

              {/* Price override */}
              <div>
                <label className="block text-xs font-medium text-navy-500 mb-1">
                  Price Override
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={popover.priceOverride}
                  onChange={(e) =>
                    setPopover({ ...popover, priceOverride: e.target.value })
                  }
                  placeholder="Use base price"
                  className="w-full px-3 py-1.5 rounded-lg border border-cream-300 text-sm text-navy-700 focus:ring-2 focus:ring-gold-400 focus:border-transparent outline-none"
                />
              </div>

              {/* Block toggle */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-navy-500">
                  Block this date
                </label>
                <button
                  onClick={() =>
                    setPopover({ ...popover, isBlocked: !popover.isBlocked })
                  }
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    popover.isBlocked
                      ? "bg-red-50 text-red-600"
                      : "bg-cream-100 text-navy-500"
                  }`}
                >
                  {popover.isBlocked ? (
                    <>
                      <Lock size={12} /> Blocked
                    </>
                  ) : (
                    <>
                      <Unlock size={12} /> Open
                    </>
                  )}
                </button>
              </div>

              {/* Save */}
              <button
                onClick={savePopover}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-gold-700 hover:bg-gold-800 text-white py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {mode === "view" && (
        <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-cream-200">
          <div className="flex items-center gap-1.5 text-xs text-navy-500">
            <div className="w-3 h-3 rounded bg-teal-50 border border-teal-200" />
            Available
          </div>
          <div className="flex items-center gap-1.5 text-xs text-navy-500">
            <div className="w-3 h-3 rounded bg-cream-200 border border-cream-300" />
            Unavailable
          </div>
          <div className="flex items-center gap-1.5 text-xs text-navy-500">
            <div className="w-3 h-3 rounded bg-gold-500" />
            Selected
          </div>
          <div className="flex items-center gap-1.5 text-xs text-navy-500">
            <div className="w-3 h-3 rounded bg-white ring-2 ring-gold-400" />
            Today
          </div>
        </div>
      )}
    </div>
  );
}
