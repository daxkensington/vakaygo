"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Loader2,
  Save,
  Lock,
  Unlock,
  X,
  Ban,
  Users,
  Calendar,
  ChevronDown,
  Link2,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Download,
  Upload,
} from "lucide-react";

/* ── Types ── */

type ListingInfo = {
  id: string;
  title: string;
  type: string;
  priceAmount: string | null;
  priceUnit: string | null;
};

type AvailabilityDay = {
  date: string;
  spots: number | null;
  spotsRemaining: number | null;
  priceOverride: string | null;
  isBlocked: boolean | null;
};

type PanelData = {
  dates: string[];
  spots: string;
  priceOverride: string;
  isBlocked: boolean;
};

/* ── Helpers ── */

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMonth(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function toDateString(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateDisplay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ── Component ── */

export default function OperatorCalendarPage() {
  const params = useParams();
  const listingId = params.listingId as string;

  const today = new Date();
  const todayStr = toDateString(today.getFullYear(), today.getMonth(), today.getDate());

  /* Listings for selector */
  const [allListings, setAllListings] = useState<ListingInfo[]>([]);
  const [listing, setListing] = useState<ListingInfo | null>(null);
  const [loadingListing, setLoadingListing] = useState(true);
  const [listingError, setListingError] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  /* Calendar state */
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [availMap, setAvailMap] = useState<Record<string, AvailabilityDay>>({});
  const [bookingsMap, setBookingsMap] = useState<Record<string, number>>({});
  const [loadingCal, setLoadingCal] = useState(false);

  /* Selection */
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const lastShiftClick = useRef<string | null>(null);

  /* Side panel */
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  /* iCal sync */
  const [icalToken, setIcalToken] = useState<string | null>(null);
  const [icalImportUrl, setIcalImportUrl] = useState("");
  const [icalImportInput, setIcalImportInput] = useState("");
  const [icalLastSync, setIcalLastSync] = useState<string | null>(null);
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalSyncing, setIcalSyncing] = useState(false);
  const [icalCopied, setIcalCopied] = useState(false);
  const [icalError, setIcalError] = useState("");
  const [icalSyncResult, setIcalSyncResult] = useState<string | null>(null);
  const [icalSectionOpen, setIcalSectionOpen] = useState(false);

  /* ── Fetch listings ── */
  useEffect(() => {
    async function fetchListings() {
      try {
        const res = await fetch("/api/listings/my");
        if (!res.ok) throw new Error("Failed to fetch listings");
        const data = await res.json();
        const mapped: ListingInfo[] = (data.listings || []).map(
          (l: Record<string, string | null>) => ({
            id: l.id,
            title: l.title,
            type: l.type,
            priceAmount: l.priceAmount,
            priceUnit: l.priceUnit,
          })
        );
        setAllListings(mapped);
        const found = mapped.find((l) => l.id === listingId);
        if (!found) {
          setListingError("Listing not found or you do not own it");
        } else {
          setListing(found);
        }
      } catch {
        setListingError("Failed to load listings");
      } finally {
        setLoadingListing(false);
      }
    }
    fetchListings();
  }, [listingId]);

  /* ── Fetch availability ── */
  const fetchAvailability = useCallback(async () => {
    setLoadingCal(true);
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
      setAvailMap(map);
      setBookingsMap(data.bookings || {});
    } catch (err) {
      console.error("Failed to load availability:", err);
    } finally {
      setLoadingCal(false);
    }
  }, [listingId, year, month]);

  useEffect(() => {
    if (listing) fetchAvailability();
  }, [fetchAvailability, listing]);

  /* ── Fetch iCal settings ── */
  const fetchIcalSettings = useCallback(async () => {
    setIcalLoading(true);
    try {
      const res = await fetch(`/api/operator/listings/${listingId}/ical`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setIcalToken(data.icalToken);
        setIcalImportUrl(data.icalImportUrl || "");
        setIcalImportInput(data.icalImportUrl || "");
        setIcalLastSync(data.icalLastSync);
      }
    } catch {
      /* silent — iCal is optional */
    } finally {
      setIcalLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    if (listing && icalSectionOpen && !icalToken) {
      fetchIcalSettings();
    }
  }, [listing, icalSectionOpen, icalToken, fetchIcalSettings]);

  /* ── iCal import handler ── */
  async function handleIcalImport() {
    if (!icalImportInput.trim()) return;
    setIcalSyncing(true);
    setIcalError("");
    setIcalSyncResult(null);
    try {
      const res = await fetch(`/api/operator/listings/${listingId}/ical/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: icalImportInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIcalError(data.error || "Import failed");
      } else {
        setIcalImportUrl(icalImportInput.trim());
        setIcalLastSync(data.lastSync);
        setIcalSyncResult(
          `Synced! Found ${data.eventsFound} events, blocked ${data.datesBlocked} new dates.`
        );
        await fetchAvailability();
        setTimeout(() => setIcalSyncResult(null), 5000);
      }
    } catch {
      setIcalError("Failed to connect to server");
    } finally {
      setIcalSyncing(false);
    }
  }

  function copyIcalUrl() {
    if (!icalToken) return;
    const url = `${window.location.origin}/api/operator/listings/${listingId}/ical?token=${icalToken}`;
    navigator.clipboard.writeText(url);
    setIcalCopied(true);
    setTimeout(() => setIcalCopied(false), 2000);
  }

  function getTimeSince(dateStr: string | null): string {
    if (!dateStr) return "Never synced";
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Less than 1 hour ago";
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  /* ── Month navigation ── */
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
    setSelectedDates(new Set());
    setPanel(null);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
    setSelectedDates(new Set());
    setPanel(null);
  }

  /* ── Day click / multi-select ── */
  function handleDayMouseDown(dateStr: string, isPast: boolean, e: React.MouseEvent) {
    if (isPast) return;
    e.preventDefault();

    if (e.shiftKey && lastShiftClick.current) {
      // Shift-click range select
      const allDays = buildDayList();
      const startIdx = allDays.indexOf(lastShiftClick.current);
      const endIdx = allDays.indexOf(dateStr);
      if (startIdx !== -1 && endIdx !== -1) {
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        const newSet = new Set(selectedDates);
        for (let i = lo; i <= hi; i++) {
          if (allDays[i] >= todayStr) newSet.add(allDays[i]);
        }
        setSelectedDates(newSet);
        openPanelForDates(newSet);
      }
      return;
    }

    // Start drag
    setIsDragging(true);
    setDragStart(dateStr);
    lastShiftClick.current = dateStr;

    // Toggle single date
    const newSet = new Set(selectedDates);
    if (newSet.has(dateStr)) {
      newSet.delete(dateStr);
    } else {
      newSet.add(dateStr);
    }
    setSelectedDates(newSet);
    if (newSet.size > 0) {
      openPanelForDates(newSet);
    } else {
      setPanel(null);
    }
  }

  function handleDayMouseEnter(dateStr: string, isPast: boolean) {
    if (!isDragging || isPast || !dragStart) return;
    const allDays = buildDayList();
    const startIdx = allDays.indexOf(dragStart);
    const endIdx = allDays.indexOf(dateStr);
    if (startIdx === -1 || endIdx === -1) return;
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const newSet = new Set<string>();
    for (let i = lo; i <= hi; i++) {
      if (allDays[i] >= todayStr) newSet.add(allDays[i]);
    }
    setSelectedDates(newSet);
    openPanelForDates(newSet);
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  function buildDayList(): string[] {
    const days: string[] = [];
    const total = getDaysInMonth(year, month);
    for (let d = 1; d <= total; d++) {
      days.push(toDateString(year, month, d));
    }
    return days;
  }

  /* ── Panel ── */
  function openPanelForDates(dates: Set<string>) {
    const arr = Array.from(dates).sort();
    if (arr.length === 0) { setPanel(null); return; }

    // Pre-fill from first selected date's existing data
    const first = availMap[arr[0]];
    setPanel({
      dates: arr,
      spots: first?.spots?.toString() || "",
      priceOverride: first?.priceOverride?.toString() || "",
      isBlocked: first?.isBlocked || false,
    });
    setSaveSuccess(false);
  }

  async function savePanel() {
    if (!panel || panel.dates.length === 0) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const dates = panel.dates.map((d) => ({
        date: d,
        spots: panel.spots ? parseInt(panel.spots) : null,
        priceOverride: panel.priceOverride || null,
        isBlocked: panel.isBlocked,
      }));
      const res = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, dates }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setSaveSuccess(true);
      await fetchAvailability();
      // Keep panel open so user sees the confirmation
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  }

  function clearSelection() {
    setSelectedDates(new Set());
    setPanel(null);
  }

  /* ── Build grid cells ── */
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const cells: Array<{ day: number; dateStr: string } | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: toDateString(year, month, d) });
  }

  /* ── Loading / error states ── */
  if (loadingListing) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-gold-700" />
      </div>
    );
  }

  if (listingError || !listing) {
    return (
      <div className="max-w-2xl">
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-8 text-center">
          <p className="text-navy-500">{listingError || "Listing not found"}</p>
          <Link
            href="/operator/listings"
            className="inline-flex items-center gap-2 mt-4 text-gold-700 hover:text-gold-600 text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Back to Listings
          </Link>
        </div>
      </div>
    );
  }

  const basePrice = listing.priceAmount
    ? `$${parseFloat(listing.priceAmount).toFixed(2)}`
    : "Not set";

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link
            href={`/operator/listings/${listingId}`}
            className="p-2 rounded-xl hover:bg-cream-100 text-navy-500 transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-navy-800">Availability Calendar</h1>
            <p className="text-sm text-navy-400 mt-0.5">
              Manage dates, pricing, and capacity
            </p>
          </div>
        </div>

        {/* Listing selector dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 bg-white rounded-xl shadow-[var(--shadow-card)] px-4 py-2.5 text-sm font-medium text-navy-700 hover:bg-cream-50 transition-colors min-w-[200px]"
          >
            <Calendar size={16} className="text-gold-700 flex-shrink-0" />
            <span className="truncate">{listing.title}</span>
            <ChevronDown size={16} className="text-navy-400 ml-auto flex-shrink-0" />
          </button>
          {dropdownOpen && allListings.length > 1 && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-[var(--shadow-elevated)] border border-cream-200 z-50 max-h-64 overflow-y-auto">
              {allListings.map((l) => (
                <Link
                  key={l.id}
                  href={`/operator/listings/${l.id}/calendar`}
                  onClick={() => setDropdownOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-cream-50 ${
                    l.id === listingId
                      ? "bg-gold-50 text-gold-700 font-semibold"
                      : "text-navy-600"
                  }`}
                >
                  <span className="truncate flex-1">{l.title}</span>
                  <span className="text-xs text-navy-400 capitalize flex-shrink-0">{l.type}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Base price banner */}
      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-gold-50 rounded-xl flex items-center justify-center">
          <DollarSign size={20} className="text-gold-700" />
        </div>
        <div>
          <p className="text-sm text-navy-400">Base Price</p>
          <p className="text-lg font-bold text-navy-700">
            {basePrice}
            {listing.priceUnit && (
              <span className="text-sm font-normal text-navy-400 ml-1">
                / {listing.priceUnit}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto">
          <span className="px-3 py-1 bg-cream-100 text-navy-500 text-xs font-medium rounded-full capitalize">
            {listing.type}
          </span>
        </div>
      </div>

      {/* Main content: calendar + side panel */}
      <div className="flex gap-6 items-start flex-col lg:flex-row">
        {/* Calendar card */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-5">
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

            {/* Selection bar */}
            {selectedDates.size > 0 && (
              <div className="flex items-center justify-between bg-gold-50 rounded-xl px-4 py-2.5 mb-4">
                <p className="text-sm font-medium text-navy-700">
                  {selectedDates.size} date{selectedDates.size > 1 ? "s" : ""} selected
                </p>
                <button
                  onClick={clearSelection}
                  className="text-xs text-navy-500 hover:text-navy-700 font-medium flex items-center gap-1"
                >
                  <X size={14} />
                  Clear
                </button>
              </div>
            )}

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-semibold text-navy-400 py-2"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 relative select-none">
              {loadingCal && (
                <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 rounded-xl">
                  <Loader2 size={24} className="animate-spin text-gold-700" />
                </div>
              )}

              {cells.map((cell, i) => {
                if (!cell) {
                  return <div key={`empty-${i}`} className="aspect-square" />;
                }

                const { day, dateStr } = cell;
                const avail = availMap[dateStr];
                const bookingCount = bookingsMap[dateStr] || 0;
                const isPast = dateStr < todayStr;
                const isToday = dateStr === todayStr;
                const isBlocked = avail?.isBlocked;
                const isSelected = selectedDates.has(dateStr);
                const hasOverride = avail?.priceOverride != null;

                // Determine cell styling
                let cellBg = "bg-white hover:bg-cream-50";
                let textColor = "text-navy-700";

                if (isPast) {
                  cellBg = "bg-cream-50";
                  textColor = "text-navy-200 pointer-events-none";
                } else if (isSelected) {
                  cellBg = "bg-gold-100 ring-2 ring-gold-500";
                  textColor = "text-navy-800";
                } else if (isBlocked) {
                  cellBg = "bg-red-50";
                  textColor = "text-red-400";
                }

                let ringClass = "";
                if (isToday && !isSelected) {
                  ringClass = "ring-2 ring-gold-500";
                }

                return (
                  <div
                    key={dateStr}
                    onMouseDown={(e) => handleDayMouseDown(dateStr, isPast, e)}
                    onMouseEnter={() => handleDayMouseEnter(dateStr, isPast)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-all relative cursor-pointer ${cellBg} ${textColor} ${ringClass}`}
                  >
                    {/* Date number */}
                    <span
                      className={`font-medium leading-tight ${
                        isBlocked && !isPast ? "line-through" : ""
                      }`}
                    >
                      {day}
                    </span>

                    {/* Price override (gold text) */}
                    {hasOverride && !isPast && !isBlocked && (
                      <span className="text-[10px] font-semibold text-gold-700 leading-tight">
                        ${parseFloat(avail!.priceOverride!).toFixed(0)}
                      </span>
                    )}

                    {/* Available spots */}
                    {avail?.spotsRemaining != null && !isPast && !isBlocked && (
                      <span className="text-[9px] text-teal-500 leading-tight">
                        {avail.spotsRemaining} left
                      </span>
                    )}

                    {/* Booking count badge (blue dot) */}
                    {bookingCount > 0 && !isPast && (
                      <div className="absolute top-1 right-1 flex items-center justify-center">
                        <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-[8px] font-bold text-white leading-none">
                            {bookingCount}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Blocked indicator */}
                    {isBlocked && !isPast && (
                      <Lock size={10} className="text-red-300 mt-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-5 mt-4">
            <h3 className="text-sm font-semibold text-navy-700 mb-3">Legend</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white border border-cream-200 flex items-center justify-center text-xs text-navy-600 font-medium">
                  15
                </div>
                <span className="text-xs text-navy-500">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-xs text-red-400 font-medium line-through">
                  15
                </div>
                <span className="text-xs text-navy-500">Blocked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white ring-2 ring-gold-500 flex items-center justify-center text-xs text-navy-600 font-medium">
                  15
                </div>
                <span className="text-xs text-navy-500">Today</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gold-100 ring-2 ring-gold-500 flex items-center justify-center text-xs text-navy-800 font-medium">
                  15
                </div>
                <span className="text-xs text-navy-500">Selected</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-cream-200">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-1.5 text-xs text-navy-500">
                  <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-[7px] font-bold text-white">3</span>
                  </div>
                  Has bookings
                </div>
                <div className="flex items-center gap-1.5 text-xs text-navy-500">
                  <span className="text-[10px] font-semibold text-gold-700">$XX</span>
                  Price override
                </div>
                <div className="flex items-center gap-1.5 text-xs text-navy-500">
                  <span className="text-[9px] text-teal-500">N left</span>
                  Remaining spots
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-gold-50 rounded-2xl p-5 mt-4">
            <h3 className="text-sm font-semibold text-navy-700 mb-2">
              How to manage availability
            </h3>
            <ul className="text-xs text-navy-500 space-y-1.5 list-disc list-inside">
              <li>Click any future date to select it and open the edit panel</li>
              <li>Click and drag across dates to select a range</li>
              <li>Hold Shift + click to extend your selection</li>
              <li>Use the side panel to set pricing, spots, or block dates in bulk</li>
              <li>Dates without availability records use your base price and unlimited spots</li>
            </ul>
          </div>

          {/* iCal Sync Section */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] mt-4 overflow-hidden">
            <button
              onClick={() => setIcalSectionOpen(!icalSectionOpen)}
              className="w-full flex items-center justify-between p-5 hover:bg-cream-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Link2 size={20} className="text-blue-600" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-navy-700">
                    iCal Calendar Sync
                  </h3>
                  <p className="text-xs text-navy-400">
                    Sync with Airbnb, Booking.com, Google Calendar
                  </p>
                </div>
              </div>
              <ChevronDown
                size={18}
                className={`text-navy-400 transition-transform ${
                  icalSectionOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {icalSectionOpen && (
              <div className="px-5 pb-5 space-y-5 border-t border-cream-200">
                {icalLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-gold-700" />
                  </div>
                ) : (
                  <>
                    {/* Export Section */}
                    <div className="pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Download size={14} className="text-navy-500" />
                        <h4 className="text-xs font-semibold text-navy-600 uppercase tracking-wide">
                          Export Calendar
                        </h4>
                      </div>
                      <p className="text-xs text-navy-400 mb-3">
                        Add this URL to Google Calendar, Airbnb, or any calendar app to
                        see your VakayGo bookings and blocked dates.
                      </p>
                      {icalToken && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/operator/listings/${listingId}/ical?token=${icalToken}`}
                            className="flex-1 px-3 py-2 rounded-xl border border-cream-300 text-xs text-navy-600 bg-cream-50 truncate"
                          />
                          <button
                            onClick={copyIcalUrl}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                              icalCopied
                                ? "bg-teal-50 text-teal-700"
                                : "bg-gold-50 text-gold-700 hover:bg-gold-100"
                            }`}
                          >
                            {icalCopied ? (
                              <>
                                <Check size={12} />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Import Section */}
                    <div className="pt-2 border-t border-cream-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Upload size={14} className="text-navy-500" />
                        <h4 className="text-xs font-semibold text-navy-600 uppercase tracking-wide">
                          Import Calendar
                        </h4>
                      </div>
                      <p className="text-xs text-navy-400 mb-3">
                        Paste your Airbnb, Booking.com, or other calendar URL here.
                        Events will be imported as blocked dates.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={icalImportInput}
                          onChange={(e) => setIcalImportInput(e.target.value)}
                          placeholder="https://www.airbnb.com/calendar/ical/..."
                          className="flex-1 px-3 py-2 rounded-xl border border-cream-300 text-xs text-navy-600 focus:ring-2 focus:ring-gold-400 focus:border-transparent outline-none transition-all"
                        />
                        <button
                          onClick={handleIcalImport}
                          disabled={icalSyncing || !icalImportInput.trim()}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-gold-700 hover:bg-gold-800 text-white transition-colors disabled:opacity-50"
                        >
                          {icalSyncing ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <RefreshCw size={12} />
                          )}
                          Sync
                        </button>
                      </div>

                      {/* Error / Success messages */}
                      {icalError && (
                        <p className="text-xs text-red-500 mt-2">{icalError}</p>
                      )}
                      {icalSyncResult && (
                        <p className="text-xs text-teal-600 mt-2">{icalSyncResult}</p>
                      )}

                      {/* Sync status */}
                      <div className="flex items-center gap-2 mt-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            icalLastSync
                              ? Date.now() - new Date(icalLastSync).getTime() <
                                86400000
                                ? "bg-teal-500"
                                : "bg-amber-500"
                              : "bg-amber-400"
                          }`}
                        />
                        <span className="text-xs text-navy-400">
                          {icalLastSync
                            ? `Last synced ${getTimeSince(icalLastSync)}`
                            : "Never synced"}
                        </span>
                        {icalImportUrl && (
                          <span className="text-xs text-navy-300 ml-auto">
                            Auto-syncs daily
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Setup Links */}
                    <div className="pt-2 border-t border-cream-200">
                      <h4 className="text-xs font-semibold text-navy-600 uppercase tracking-wide mb-3">
                        Quick Setup Guides
                      </h4>
                      <div className="space-y-2">
                        <a
                          href="https://www.airbnb.com/help/article/99"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-navy-500 hover:text-gold-600 transition-colors"
                        >
                          <ExternalLink size={12} />
                          Sync with Airbnb
                        </a>
                        <a
                          href="https://partner.booking.com/en-gb/help/rates-availability/how-do-i-export-my-calendar"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-navy-500 hover:text-gold-600 transition-colors"
                        >
                          <ExternalLink size={12} />
                          Sync with Booking.com
                        </a>
                        <a
                          href="https://support.google.com/calendar/answer/37118"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-navy-500 hover:text-gold-600 transition-colors"
                        >
                          <ExternalLink size={12} />
                          Sync with Google Calendar
                        </a>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-24">
          {panel && panel.dates.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-[var(--shadow-elevated)] p-6">
              {/* Panel header */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-navy-800">
                  Edit{" "}
                  {panel.dates.length === 1 ? "Date" : `${panel.dates.length} Dates`}
                </h3>
                <button
                  onClick={clearSelection}
                  className="p-1.5 rounded-lg hover:bg-cream-100 text-navy-400 hover:text-navy-600 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Date display */}
              <div className="mb-5">
                {panel.dates.length === 1 ? (
                  <p className="text-sm text-navy-600 font-medium">
                    {formatDateDisplay(panel.dates[0])}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {panel.dates.map((d) => (
                      <span
                        key={d}
                        className="inline-block text-xs bg-cream-100 text-navy-600 px-2 py-1 rounded-lg"
                      >
                        {d.slice(5)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Available / Blocked toggle */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">
                  Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPanel({ ...panel, isBlocked: false })}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      !panel.isBlocked
                        ? "bg-teal-50 text-teal-700 ring-2 ring-teal-400"
                        : "bg-cream-100 text-navy-500 hover:bg-cream-200"
                    }`}
                  >
                    <Unlock size={14} />
                    Available
                  </button>
                  <button
                    onClick={() => setPanel({ ...panel, isBlocked: true })}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      panel.isBlocked
                        ? "bg-red-50 text-red-600 ring-2 ring-red-400"
                        : "bg-cream-100 text-navy-500 hover:bg-cream-200"
                    }`}
                  >
                    <Ban size={14} />
                    Blocked
                  </button>
                </div>
              </div>

              {/* Price override */}
              {!panel.isBlocked && (
                <>
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">
                      Price Override
                    </label>
                    <div className="relative">
                      <DollarSign
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={panel.priceOverride}
                        onChange={(e) =>
                          setPanel({ ...panel, priceOverride: e.target.value })
                        }
                        placeholder={`Base: ${basePrice}`}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-cream-300 text-sm text-navy-700 focus:ring-2 focus:ring-gold-400 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-navy-400 mt-1">
                      Leave empty to use base price
                    </p>
                  </div>

                  {/* Spots available */}
                  <div className="mb-6">
                    <label className="block text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">
                      Spots Available
                    </label>
                    <div className="relative">
                      <Users
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300"
                      />
                      <input
                        type="number"
                        min="0"
                        value={panel.spots}
                        onChange={(e) =>
                          setPanel({ ...panel, spots: e.target.value })
                        }
                        placeholder="Unlimited"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-cream-300 text-sm text-navy-700 focus:ring-2 focus:ring-gold-400 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-navy-400 mt-1">
                      Leave empty for unlimited capacity
                    </p>
                  </div>
                </>
              )}

              {/* Booking info for single date */}
              {panel.dates.length === 1 && bookingsMap[panel.dates[0]] > 0 && (
                <div className="mb-5 bg-blue-50 rounded-xl px-4 py-3 flex items-center gap-3">
                  <Users size={16} className="text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-700">
                      {bookingsMap[panel.dates[0]]} booking
                      {bookingsMap[panel.dates[0]] > 1 ? "s" : ""}
                    </p>
                    <p className="text-[11px] text-blue-500">on this date</p>
                  </div>
                </div>
              )}

              {/* Save button */}
              <button
                onClick={savePanel}
                disabled={saving}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                  saveSuccess
                    ? "bg-teal-500 text-white"
                    : "bg-gold-700 hover:bg-gold-800 text-white"
                }`}
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : saveSuccess ? (
                  <>Saved!</>
                ) : (
                  <>
                    <Save size={16} />
                    Save {panel.dates.length > 1 ? `${panel.dates.length} Dates` : ""}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6 text-center">
              <div className="w-12 h-12 bg-cream-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Calendar size={24} className="text-navy-300" />
              </div>
              <p className="text-sm font-medium text-navy-600 mb-1">
                No date selected
              </p>
              <p className="text-xs text-navy-400">
                Click or drag on the calendar to select dates and manage availability
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
