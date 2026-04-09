"use client";

import { useEffect, useState } from "react";
import {
  Flag,
  Plus,
  Loader2,
  X,
  AlertCircle,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

type FeatureFlag = {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
};

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formRollout, setFormRollout] = useState("100");
  const [formSaving, setFormSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/feature-flags")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setFlags(data.flags || data);
      })
      .catch(() => setError("Failed to load feature flags"))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setShowForm(false);
    setFormKey("");
    setFormDescription("");
    setFormRollout("100");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setFormSaving(true);

    try {
      const res = await fetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: formKey,
          description: formDescription,
          rolloutPercent: parseInt(formRollout),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create flag");
        return;
      }
      setFlags((prev) => [...prev, data]);
      setSuccess("Feature flag created.");
      resetForm();
    } catch {
      setError("Something went wrong.");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleToggle(flag: FeatureFlag) {
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !flag.enabled }),
      });
      const data = await res.json();
      if (res.ok) {
        setFlags((prev) =>
          prev.map((f) => (f.id === flag.id ? { ...f, enabled: !f.enabled } : f))
        );
        setSuccess(`Flag "${flag.key}" ${!flag.enabled ? "enabled" : "disabled"}.`);
      } else {
        setError(data.error || "Failed to toggle flag");
      }
    } catch {
      setError("Failed to toggle flag.");
    }
  }

  async function handleRolloutChange(flag: FeatureFlag, value: number) {
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolloutPercent: value }),
      });
      if (res.ok) {
        setFlags((prev) =>
          prev.map((f) => (f.id === flag.id ? { ...f, rolloutPercent: value } : f))
        );
      }
    } catch {
      setError("Failed to update rollout.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={40} className="animate-spin text-gold-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Feature Flags
          </h1>
          <p className="text-navy-400 mt-1">
            Toggle features and control rollout percentages.
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
          New Flag
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
            <h2 className="text-lg font-bold text-navy-700">Create Feature Flag</h2>
            <button onClick={resetForm} className="text-navy-400 hover:text-navy-600">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Flag Key
                </label>
                <input
                  type="text"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value)}
                  required
                  placeholder="e.g., new_checkout_flow"
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Rollout %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formRollout}
                  onChange={(e) => setFormRollout(e.target.value)}
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
                placeholder="What does this flag control?"
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={formSaving}
                className="flex items-center gap-2 bg-gold-500 hover:bg-gold-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {formSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                Create Flag
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

      {/* Flags Table */}
      {flags.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <Flag className="w-12 h-12 text-navy-200 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-navy-700 mb-2">No feature flags</h2>
          <p className="text-sm text-navy-400">Create your first feature flag to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cream-200">
                  <th className="px-6 py-4 font-semibold text-navy-500">Key</th>
                  <th className="px-6 py-4 font-semibold text-navy-500">Description</th>
                  <th className="px-6 py-4 font-semibold text-navy-500 text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-navy-500 text-center">Rollout</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr
                    key={flag.id}
                    className="border-b border-cream-100 last:border-0 hover:bg-cream-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <code className="bg-cream-100 px-2 py-1 rounded text-navy-700 text-xs font-mono">
                        {flag.key}
                      </code>
                    </td>
                    <td className="px-6 py-4 text-navy-500">
                      {flag.description || <span className="text-navy-300 italic">No description</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleToggle(flag)}
                        className="inline-flex items-center gap-1.5 transition-colors"
                      >
                        {flag.enabled ? (
                          <ToggleRight size={28} className="text-green-500" />
                        ) : (
                          <ToggleLeft size={28} className="text-navy-300" />
                        )}
                        <span className={`text-xs font-semibold ${flag.enabled ? "text-green-600" : "text-navy-400"}`}>
                          {flag.enabled ? "ON" : "OFF"}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={flag.rolloutPercent}
                          onChange={(e) =>
                            handleRolloutChange(flag, parseInt(e.target.value))
                          }
                          className="w-20 accent-gold-500"
                        />
                        <span className="text-xs font-semibold text-navy-600 w-8">
                          {flag.rolloutPercent}%
                        </span>
                      </div>
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
