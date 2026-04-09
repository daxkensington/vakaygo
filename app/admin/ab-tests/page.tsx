"use client";

import { useEffect, useState } from "react";
import {
  FlaskConical,
  Plus,
  Loader2,
  X,
  AlertCircle,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Trash2,
  BarChart3,
} from "lucide-react";

type Variant = {
  name: string;
  weight: number;
};

type ABTest = {
  id: string;
  name: string;
  description: string;
  variants: Variant[];
  trafficPercent: number;
  active: boolean;
  createdAt: string;
};

export default function ABTestsPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTraffic, setFormTraffic] = useState("50");
  const [formVariants, setFormVariants] = useState<Variant[]>([
    { name: "Control", weight: 50 },
    { name: "Variant A", weight: 50 },
  ]);
  const [formSaving, setFormSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/ab-tests")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setTests(data.tests || data);
      })
      .catch(() => setError("Failed to load A/B tests"))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setShowForm(false);
    setFormName("");
    setFormDescription("");
    setFormTraffic("50");
    setFormVariants([
      { name: "Control", weight: 50 },
      { name: "Variant A", weight: 50 },
    ]);
  }

  function updateVariant(index: number, field: keyof Variant, value: string | number) {
    setFormVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  }

  function addVariant() {
    setFormVariants((prev) => [
      ...prev,
      { name: `Variant ${String.fromCharCode(65 + prev.length - 1)}`, weight: 0 },
    ]);
  }

  function removeVariant(index: number) {
    if (formVariants.length <= 2) return;
    setFormVariants((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setFormSaving(true);

    try {
      const res = await fetch("/api/admin/ab-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          trafficPercent: parseInt(formTraffic),
          variants: formVariants,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create test");
        return;
      }
      setTests((prev) => [...prev, data]);
      setSuccess("A/B test created.");
      resetForm();
    } catch {
      setError("Something went wrong.");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleToggle(test: ABTest) {
    try {
      const res = await fetch(`/api/admin/ab-tests/${test.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !test.active }),
      });
      if (res.ok) {
        setTests((prev) =>
          prev.map((t) => (t.id === test.id ? { ...t, active: !t.active } : t))
        );
        setSuccess(`Test "${test.name}" ${!test.active ? "activated" : "paused"}.`);
      }
    } catch {
      setError("Failed to toggle test.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this A/B test?")) return;
    try {
      const res = await fetch(`/api/admin/ab-tests/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTests((prev) => prev.filter((t) => t.id !== id));
        setSuccess("Test deleted.");
      }
    } catch {
      setError("Failed to delete test.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={40} className="animate-spin text-gold-500" />
      </div>
    );
  }

  const totalWeight = formVariants.reduce((sum, v) => sum + (Number(v.weight) || 0), 0);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            A/B Tests
          </h1>
          <p className="text-navy-400 mt-1">
            Run experiments to optimize user experience.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus size={16} />
          New Test
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

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-navy-700">Create A/B Test</h2>
            <button onClick={resetForm} className="text-navy-400 hover:text-navy-600">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Test Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  placeholder="e.g., Checkout Button Color"
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Traffic %
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formTraffic}
                  onChange={(e) => setFormTraffic(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">
                Description
              </label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What are you testing?"
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
              />
            </div>

            {/* Variants */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-navy-600">
                  Variants
                </label>
                <div className="flex items-center gap-2">
                  {totalWeight !== 100 && (
                    <span className="text-xs text-amber-600 font-medium">
                      Weights sum to {totalWeight}% (should be 100%)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={addVariant}
                    className="text-xs text-gold-600 hover:text-gold-700 font-semibold"
                  >
                    + Add Variant
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {formVariants.map((variant, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={variant.name}
                      onChange={(e) => updateVariant(i, "name", e.target.value)}
                      placeholder="Variant name"
                      required
                      className="flex-1 px-4 py-2.5 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 text-sm"
                    />
                    <div className="flex items-center gap-1 w-24">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={variant.weight}
                        onChange={(e) => updateVariant(i, "weight", parseInt(e.target.value) || 0)}
                        required
                        className="w-16 px-3 py-2.5 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 text-sm text-center"
                      />
                      <span className="text-sm text-navy-400">%</span>
                    </div>
                    {formVariants.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeVariant(i)}
                        className="p-1.5 rounded-lg text-navy-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={formSaving}
                className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {formSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                Create Test
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

      {/* Tests Table */}
      {tests.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <FlaskConical className="w-12 h-12 text-navy-200 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-navy-700 mb-2">No A/B tests</h2>
          <p className="text-sm text-navy-400">Create your first experiment to start optimizing.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cream-200">
                  <th className="px-6 py-4 font-semibold text-navy-500">Test</th>
                  <th className="px-6 py-4 font-semibold text-navy-500">Variants</th>
                  <th className="px-6 py-4 font-semibold text-navy-500 text-center">Traffic</th>
                  <th className="px-6 py-4 font-semibold text-navy-500 text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-navy-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => (
                  <tr
                    key={test.id}
                    className="border-b border-cream-100 last:border-0 hover:bg-cream-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="font-semibold text-navy-700">{test.name}</p>
                      {test.description && (
                        <p className="text-xs text-navy-400 mt-0.5">{test.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {test.variants.map((v, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-xs font-medium bg-cream-100 text-navy-600 px-2 py-1 rounded-lg"
                          >
                            <BarChart3 size={10} />
                            {v.name} ({v.weight}%)
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm font-semibold text-navy-700">
                        {test.trafficPercent}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleToggle(test)}
                        className="inline-flex items-center gap-1.5 transition-colors"
                      >
                        {test.active ? (
                          <ToggleRight size={28} className="text-green-500" />
                        ) : (
                          <ToggleLeft size={28} className="text-navy-300" />
                        )}
                        <span className={`text-xs font-semibold ${test.active ? "text-green-600" : "text-navy-400"}`}>
                          {test.active ? "Active" : "Paused"}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(test.id)}
                        className="p-2 rounded-lg text-navy-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
