"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  Plus,
  Loader2,
  Trash2,
  Edit3,
  X,
  AlertCircle,
  CheckCircle,
  Zap,
} from "lucide-react";

type Template = {
  id: string;
  title: string;
  content: string;
  shortcut: string;
};

export default function MessageTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formShortcut, setFormShortcut] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  useEffect(() => {
    fetch("/api/operator/message-templates")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setTemplates(data.templates || data);
      })
      .catch(() => setError("Failed to load templates"))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormShortcut("");
  }

  function startEdit(template: Template) {
    setEditingId(template.id);
    setFormTitle(template.title);
    setFormContent(template.content);
    setFormShortcut(template.shortcut);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setFormSaving(true);

    const body = {
      title: formTitle,
      content: formContent,
      shortcut: formShortcut,
    };

    try {
      const url = editingId
        ? `/api/operator/message-templates/${editingId}`
        : "/api/operator/message-templates";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save template");
        return;
      }

      if (editingId) {
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? data : t)));
        setSuccess("Template updated.");
      } else {
        setTemplates((prev) => [...prev, data]);
        setSuccess("Template created.");
      }
      resetForm();
    } catch {
      setError("Something went wrong.");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      const res = await fetch(`/api/operator/message-templates/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        setSuccess("Template deleted.");
      }
    } catch {
      setError("Failed to delete template.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gold-700" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Message Templates
          </h1>
          <p className="text-navy-400 mt-1">
            Create reusable message templates for quick responses.
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
          New Template
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
              {editingId ? "Edit Template" : "Create Template"}
            </h2>
            <button onClick={resetForm} className="text-navy-400 hover:text-navy-600">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  placeholder="e.g., Welcome Message"
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-600 mb-1.5">
                  Shortcut
                </label>
                <input
                  type="text"
                  value={formShortcut}
                  onChange={(e) => setFormShortcut(e.target.value)}
                  required
                  placeholder="e.g., /welcome"
                  className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-600 mb-1.5">
                Content
              </label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                required
                rows={5}
                placeholder="Type your template message here..."
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={formSaving}
                className="flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {formSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                {editingId ? "Update Template" : "Create Template"}
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

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <MessageSquare className="w-12 h-12 text-navy-200 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-navy-700 mb-2">No templates yet</h2>
          <p className="text-sm text-navy-400">
            Create message templates to respond to guests faster.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-50 text-teal-600 shrink-0">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-navy-700">{template.title}</h3>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gold-700 bg-gold-50 px-2 py-0.5 rounded-full mt-0.5">
                      <Zap size={10} />
                      {template.shortcut}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(template)}
                    className="p-2 rounded-lg text-navy-400 hover:bg-cream-100 hover:text-navy-600 transition-colors"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-2 rounded-lg text-navy-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-navy-500 leading-relaxed pl-[52px] whitespace-pre-wrap">
                {template.content.length > 200
                  ? template.content.slice(0, 200) + "..."
                  : template.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
