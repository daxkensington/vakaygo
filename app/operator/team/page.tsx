"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Loader2,
  Trash2,
  X,
  AlertCircle,
  CheckCircle,
  Mail,
  Shield,
  UserPlus,
} from "lucide-react";

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: "cohost" | "staff";
  joinedAt: string;
};

const roleColors: Record<string, string> = {
  cohost: "bg-gold-50 text-gold-700",
  staff: "bg-teal-50 text-teal-700",
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"cohost" | "staff">("cohost");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetch("/api/operator/team")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setMembers(data.members || data);
      })
      .catch(() => setError("Failed to load team"))
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setInviting(true);

    try {
      const res = await fetch("/api/operator/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send invite");
        return;
      }
      setMembers((prev) => [...prev, data]);
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setShowInvite(false);
    } catch {
      setError("Something went wrong.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(id: string, email: string) {
    if (!confirm(`Remove ${email} from your team?`)) return;
    try {
      const res = await fetch(`/api/operator/team/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== id));
        setSuccess("Team member removed.");
      }
    } catch {
      setError("Failed to remove member.");
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Team Management
          </h1>
          <p className="text-navy-400 mt-1">
            Invite co-hosts and staff to help manage your listings.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 bg-gold-700 hover:bg-gold-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        >
          <UserPlus size={16} />
          Invite Member
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

      {/* Invite Form */}
      {showInvite && (
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-navy-700">Invite Team Member</h2>
            <button onClick={() => setShowInvite(false)} className="text-navy-400 hover:text-navy-600">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleInvite} className="flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-navy-600 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="colleague@example.com"
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-sm font-medium text-navy-600 mb-1.5">
                Role
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "cohost" | "staff")}
                className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 outline-none focus:ring-2 focus:ring-gold-500/50 appearance-none"
              >
                <option value="cohost">Co-host</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gold-700 hover:bg-gold-800 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {inviting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              Send Invite
            </button>
          </form>
        </div>
      )}

      {/* Team Members */}
      {members.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
          <Users className="w-12 h-12 text-navy-200 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-navy-700 mb-2">No team members yet</h2>
          <p className="text-sm text-navy-400">
            Invite co-hosts or staff to help manage your business.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-6 py-4">
            <h2 className="font-bold text-navy-700">
              Team Members ({members.length})
            </h2>
          </div>
          <div className="divide-y divide-cream-100">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-4 px-6 py-4 hover:bg-cream-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-bold text-sm shrink-0">
                  {(member.name || member.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-navy-700 truncate">
                    {member.name || member.email}
                  </p>
                  <p className="text-sm text-navy-400 truncate">{member.email}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${roleColors[member.role] || "bg-gray-100 text-gray-600"}`}>
                  <Shield size={10} className="inline mr-1" />
                  {member.role}
                </span>
                <span className="text-xs text-navy-400 hidden sm:block">
                  Joined {new Date(member.joinedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <button
                  onClick={() => handleRemove(member.id, member.email)}
                  className="p-2 rounded-lg text-navy-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
