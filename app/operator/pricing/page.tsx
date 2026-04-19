"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Plus,
  Loader2,
  Trash2,
  Edit3,
  X,
  TrendingUp,
  Calendar,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

type Listing = {
  id: string;
  title: string;
};

type PricingRule = {
  id: string;
  listingId: string;
  listingTitle: string;
  ruleType: "surge" | "seasonal" | "weekday" | "weekend";
  multiplier: number;
  startDate: string | null;
  endDate: string | null;
  daysOfWeek: number[];
  active: boolean;
};

const RULE_TYPES = [
  { value: "surge", label: "Surge Pricing" },
  { value: "seasonal", label: "Seasonal" },
  { value: "weekday", label: "Weekday" },
  { value: "weekend", label: "Weekend" },
] as const;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ruleTypeColors: Record<string, string> = {
  surge: "bg-red-50 text-red-700",
  seasonal: "bg-teal-50 text-teal-700",
  weekday: "bg-blue-50 text-blue-700",
  weekend: "bg-gold-50 text-gold-700",
};

export default function PricingRulesPage() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formListingId, setFormListingId] = useState("");
  const [formRuleType, setFormRuleType] = useState<PricingRule["ruleType"]>("surge");
  const [formMultiplier, setFormMultiplier] = useState("1.5");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formDays, setFormDays] = useState<number[]>([]);
  const [formSaving, setFormSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/operator/pricing-rules").then((r) => r.json()),
      fetch("/api/operator/listings?limit=100").then((r) => r.json()),
    ])
      .then(([rulesData, listingsData]) => {
        if (!rulesData.error) setRules(rulesData.rules || rulesData);
        if (!listingsData.error) {
          const list = listingsData.listings || listingsData;
          setListings(Array.isArray(list) ? list : []);
        }
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormListingId("");
    setFormRuleType("surge");
    setFormMultiplier("1.5");
    setFormStartDate("");
    setFormEndDate("");
    setFormDays([]);
  }

  function startEdit(rule: PricingRule) {
    setEditingId(rule.id);
    setFormListingId(rule.listingId);
    setFormRuleType(rule.ruleType);
    setFormMultiplier(rule.multiplier.toString());
    setFormStartDate(rule.startDate || "");
    setFormEndDate(rule.endDate || "");
    setFormDays(rule.daysOfWeek || []);
    setShowForm(true);
  }

  function toggleDay(day: number) {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setFormSaving(true);

    const body = {
      listingId: formListingId,
      ruleType: formRuleType,
      multiplier: parseFloat(formMultiplier),
      startDate: formStartDate || null,
      endDate: formEndDate || null,
      daysOfWeek: formDays,
    };

    try {
      const url = editingId
        ? `/api/operator/pricing-rules/${editingId}`
        : "/api/operator/pricing-rules";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save rule");
        return;
      }

      if (editingId) {
        setRules((prev) => prev.map((r) => (r.id === editingId ? data : r)));
        setSuccess("Pricing rule updated.");
      } else {
        setRules((prev) => [...prev, data]);
        setSuccess("Pricing rule created.");
      }
      resetForm();
    } catch {
      setError("Something went wrong.");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this pricing rule?")) return;
    try {
      const res = await fetch(`/api/operator/pricing-rules/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== id));
        setSuccess("Rule deleted.");
      }
    } catch {
      setError("Failed to delete rule.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Dynamic Pricing
          </h1>
          <p className="text-navy-400 mt-1">
            Set pricing rules to optimize revenue across your listings.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          Add Rule
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <CheckCircle size={16} />
          {success}
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-navy-700">
              {editingId ? "Edit Rule" : "Create Pricing Rule"}
            </h2>
            <button onClick={resetForm} className="text-navy-400 hover:text-navy-600">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Listing
                </label>
                <select
                  value={formListingId}
                  onChange={(e) => setFormListingId(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 appearance-none"
                >
                  <option value="">Select a listing</option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Rule Type
                </label>
                <select
                  value={formRuleType}
                  onChange={(e) => setFormRuleType(e.target.value as PricingRule["ruleType"])}
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 appearance-none"
                >
                  {RULE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">
                Multiplier
              </label>
              <div className="flex items-center gap-3 max-w-xs">
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="5"
                  value={formMultiplier}
                  onChange={(e) => setFormMultiplier(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                />
                <span className="text-lg font-bold text-gold-700 shrink-0">
                  {parseFloat(formMultiplier || "1").toFixed(2)}x
                </span>
              </div>
            </div>

            {(formRuleType === "surge" || formRuleType === "seasonal") && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-600 mb-1.5">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                  />
                </div>
              </div>
            )}

            {(formRuleType === "weekday" || formRuleType === "weekend") && (
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Days of Week
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formDays.includes(i)
                          ? "bg-gold-700 text-white"
                          : "bg-cream-100 text-navy-500 hover:bg-cream-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={formSaving}
                className="flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {formSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                {editingId ? "Update Rule" : "Create Rule"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-navy-500 hover:bg-cream-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <DollarSign className="w-12 h-12 text-navy-200 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-navy-700 mb-2">No pricing rules yet</h2>
          <p className="text-sm text-navy-400">
            Create dynamic pricing rules to automatically adjust your rates.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)] flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gold-50 text-gold-700 shrink-0">
                <TrendingUp size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-navy-700 truncate">
                    {rule.listingTitle}
                  </p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ruleTypeColors[rule.ruleType] || "bg-gray-100 text-gray-600"}`}>
                    {rule.ruleType}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-navy-400">
                  {rule.startDate && rule.endDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} />
                      {rule.startDate} to {rule.endDate}
                    </span>
                  )}
                  {rule.daysOfWeek.length > 0 && (
                    <span>
                      {rule.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-lg font-bold text-gold-700 shrink-0 bg-gold-50 px-3 py-1.5 rounded-xl">
                {rule.multiplier.toFixed(2)}x
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startEdit(rule)}
                  className="p-2 rounded-lg text-navy-400 hover:bg-cream-100 hover:text-navy-600 transition-colors"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-2 rounded-lg text-navy-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
