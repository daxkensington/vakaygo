"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Tag,
  Plus,
  Loader2,
  Search,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Calendar,
  Users,
  Percent,
  DollarSign,
  X,
  Check,
} from "lucide-react";

type PromoCode = {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: string;
  currency: string;
  minOrderAmount: string | null;
  maxDiscountAmount: string | null;
  maxUses: number | null;
  currentUses: number;
  maxUsesPerUser: number;
  validFrom: string;
  validUntil: string;
  applicableTypes: string[] | null;
  applicableIslands: number[] | null;
  isActive: boolean;
  createdAt: string;
};

type FormData = {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  currency: string;
  minOrderAmount: string;
  maxDiscountAmount: string;
  maxUses: string;
  maxUsesPerUser: string;
  validFrom: string;
  validUntil: string;
  applicableTypes: string[];
  isActive: boolean;
};

const LISTING_TYPES = [
  "stay", "tour", "dining", "event", "transport", "guide", "excursion", "transfer", "vip", "spa",
];

const defaultForm: FormData = {
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  currency: "XCD",
  minOrderAmount: "",
  maxDiscountAmount: "",
  maxUses: "",
  maxUsesPerUser: "1",
  validFrom: "",
  validUntil: "",
  applicableTypes: [],
  isActive: true,
};

function getPromoStatus(promo: PromoCode): { label: string; color: string } {
  const now = new Date();
  if (!promo.isActive) return { label: "Inactive", color: "bg-gray-100 text-gray-600" };
  if (new Date(promo.validUntil) < now) return { label: "Expired", color: "bg-red-100 text-red-600" };
  if (new Date(promo.validFrom) > now) return { label: "Scheduled", color: "bg-blue-100 text-blue-600" };
  if (promo.maxUses !== null && promo.currentUses >= promo.maxUses)
    return { label: "Exhausted", color: "bg-amber-100 text-amber-700" };
  return { label: "Active", color: "bg-green-100 text-green-700" };
}

export default function AdminPromosPage() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchPromos = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/promos");
      if (res.ok) {
        const data = await res.json();
        setPromos(data.promos || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  function handleEdit(promo: PromoCode) {
    setEditingId(promo.id);
    setForm({
      code: promo.code,
      description: promo.description || "",
      discountType: promo.discountType as "percentage" | "fixed",
      discountValue: promo.discountValue,
      currency: promo.currency || "XCD",
      minOrderAmount: promo.minOrderAmount || "",
      maxDiscountAmount: promo.maxDiscountAmount || "",
      maxUses: promo.maxUses !== null ? String(promo.maxUses) : "",
      maxUsesPerUser: String(promo.maxUsesPerUser || 1),
      validFrom: promo.validFrom.slice(0, 16),
      validUntil: promo.validUntil.slice(0, 16),
      applicableTypes: promo.applicableTypes || [],
      isActive: promo.isActive,
    });
    setShowForm(true);
    setError("");
  }

  function handleNew() {
    setEditingId(null);
    setForm({ ...defaultForm, validFrom: new Date().toISOString().slice(0, 16) });
    setShowForm(true);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        ...form,
        discountValue: form.discountValue,
        minOrderAmount: form.minOrderAmount || null,
        maxDiscountAmount: form.maxDiscountAmount || null,
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        maxUsesPerUser: parseInt(form.maxUsesPerUser) || 1,
        applicableTypes: form.applicableTypes.length > 0 ? form.applicableTypes : null,
      };

      const url = editingId ? `/api/admin/promos/${editingId}` : "/api/admin/promos";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save promo code");
        return;
      }

      setShowForm(false);
      fetchPromos();
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, currentActive: boolean) {
    try {
      await fetch(`/api/admin/promos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      fetchPromos();
    } catch {
      // silently fail
    }
  }

  const filtered = promos.filter(
    (p) =>
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1
            className="text-2xl font-bold text-navy-800"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Promo Codes
          </h1>
          <p className="text-sm text-navy-400 mt-1">
            Create and manage promotional discount codes
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors"
        >
          <Plus size={16} />
          New Promo Code
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search promo codes..."
          className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
        />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-[var(--shadow-elevated)]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-navy-700">
                {editingId ? "Edit Promo Code" : "New Promo Code"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-cream-100 rounded-lg">
                <X size={18} className="text-navy-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Code */}
              <div>
                <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Code</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SUMMER25"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm font-mono tracking-wider"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="25% off summer bookings"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
                />
              </div>

              {/* Discount Type & Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Discount Type</label>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as "percentage" | "fixed" })}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">
                    {form.discountType === "percentage" ? "Percentage" : "Amount"}
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    placeholder={form.discountType === "percentage" ? "25" : "10.00"}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
                  />
                </div>
              </div>

              {/* Min Order & Max Discount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Min Order ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.minOrderAmount}
                    onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })}
                    placeholder="Optional"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Max Discount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.maxDiscountAmount}
                    onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value })}
                    placeholder="Optional"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
                  />
                </div>
              </div>

              {/* Usage Limits */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Max Total Uses</label>
                  <input
                    type="number"
                    min="1"
                    value={form.maxUses}
                    onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    placeholder="Unlimited"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Per-User Limit</label>
                  <input
                    type="number"
                    min="1"
                    value={form.maxUsesPerUser}
                    onChange={(e) => setForm({ ...form, maxUsesPerUser: e.target.value })}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
                  />
                </div>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Valid From</label>
                  <input
                    type="datetime-local"
                    required
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">Valid Until</label>
                  <input
                    type="datetime-local"
                    required
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/30 text-sm"
                  />
                </div>
              </div>

              {/* Applicable Types */}
              <div>
                <label className="text-xs font-semibold text-navy-500 uppercase tracking-wider">
                  Applicable Listing Types
                </label>
                <p className="text-xs text-navy-300 mt-0.5 mb-2">Leave empty to apply to all types</p>
                <div className="flex flex-wrap gap-2">
                  {LISTING_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        const types = form.applicableTypes.includes(type)
                          ? form.applicableTypes.filter((t) => t !== type)
                          : [...form.applicableTypes, type];
                        setForm({ ...form, applicableTypes: types });
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        form.applicableTypes.includes(type)
                          ? "bg-gold-700 text-white"
                          : "bg-cream-100 text-navy-500 hover:bg-cream-200"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 accent-teal-500"
                />
                <span className="text-sm font-medium text-navy-700">Active</span>
              </label>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl">{error}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2.5 bg-cream-100 hover:bg-cream-200 text-navy-600 rounded-xl font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Promo Codes Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-gold-700" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-[var(--shadow-card)]">
          <Tag size={40} className="text-navy-200 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-navy-700">No promo codes yet</h3>
          <p className="text-navy-400 mt-1 text-sm">Create your first promo code to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50">
                  <th className="text-left px-4 py-3 font-semibold text-navy-500 text-xs uppercase tracking-wider">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-500 text-xs uppercase tracking-wider">Discount</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-500 text-xs uppercase tracking-wider hidden md:table-cell">Valid</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-500 text-xs uppercase tracking-wider">Uses</th>
                  <th className="text-left px-4 py-3 font-semibold text-navy-500 text-xs uppercase tracking-wider">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-navy-500 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((promo) => {
                  const status = getPromoStatus(promo);
                  return (
                    <tr key={promo.id} className="border-b border-cream-100 hover:bg-cream-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-navy-700 tracking-wider">{promo.code}</span>
                        {promo.description && (
                          <p className="text-xs text-navy-400 mt-0.5">{promo.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-navy-700">
                          {promo.discountType === "percentage" ? (
                            <span className="flex items-center gap-1">
                              <Percent size={12} />
                              {parseFloat(promo.discountValue)}%
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <DollarSign size={12} />
                              {parseFloat(promo.discountValue).toFixed(2)}
                            </span>
                          )}
                        </span>
                        {promo.maxDiscountAmount && (
                          <p className="text-xs text-navy-300">Max: ${parseFloat(promo.maxDiscountAmount).toFixed(2)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs text-navy-500">
                          {new Date(promo.validFrom).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-navy-300">
                          to {new Date(promo.validUntil).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-navy-700">{promo.currentUses}</span>
                        <span className="text-navy-300">
                          {promo.maxUses !== null ? ` / ${promo.maxUses}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(promo)}
                            className="p-1.5 hover:bg-cream-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} className="text-navy-400" />
                          </button>
                          <button
                            onClick={() => handleToggle(promo.id, promo.isActive)}
                            className="p-1.5 hover:bg-cream-100 rounded-lg transition-colors"
                            title={promo.isActive ? "Deactivate" : "Activate"}
                          >
                            {promo.isActive ? (
                              <ToggleRight size={18} className="text-teal-500" />
                            ) : (
                              <ToggleLeft size={18} className="text-navy-300" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
