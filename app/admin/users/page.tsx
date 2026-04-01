"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Shield,
  Briefcase,
  UserCheck,
  Eye,
  Download,
} from "lucide-react";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
  businessName: string | null;
  createdAt: string;
  listingCount: number;
  bookingCount: number;
};

type UsersResponse = {
  users: User[];
  total: number;
  page: number;
  totalPages: number;
};

type Role = "traveler" | "operator" | "admin";

const ROLE_COLORS: Record<string, string> = {
  traveler: "bg-teal-100 text-teal-700",
  operator: "bg-amber-100 text-amber-700",
  admin: "bg-navy-100 text-navy-700",
};

const ROLE_OPTIONS: { value: "" | Role; label: string }[] = [
  { value: "", label: "All Roles" },
  { value: "traveler", label: "Traveler" },
  { value: "operator", label: "Operator" },
  { value: "admin", label: "Admin" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Avatar({ user }: { user: User }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }
  const letter = (user.name?.charAt(0) ?? user.email.charAt(0)).toUpperCase();
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-100 text-sm font-semibold text-navy-600">
      {letter}
    </div>
  );
}

export default function AdminUsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<"" | Role>("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [detailUser, setDetailUser] = useState<User | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    if (roleFilter) params.set("role", roleFilter);
    if (searchDebounced) params.set("search", searchDebounced);

    fetch(`/api/admin/users?${params}`)
      .then((r) => r.json())
      .then((d: UsersResponse) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, roleFilter, searchDebounced]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [roleFilter]);

  // Derive stats from current page data (or full response)
  const stats = data
    ? {
        total: data.total,
        travelers: data.users.filter((u) => u.role === "traveler").length,
        operators: data.users.filter((u) => u.role === "operator").length,
        admins: data.users.filter((u) => u.role === "admin").length,
      }
    : null;

  async function handleRoleChange(userId: string, newRole: Role) {
    const user = data?.users.find((u) => u.id === userId);
    if (!user) return;

    const confirmed = window.confirm(
      `Change ${user.name ?? user.email}'s role from "${user.role}" to "${newRole}"?`
    );
    if (!confirmed) return;

    setChangingRole(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed");
      fetchUsers();
    } catch {
      alert("Failed to update user role. Please try again.");
    } finally {
      setChangingRole(null);
    }
  }

  const statCards = stats
    ? [
        {
          label: "Total Users",
          value: stats.total,
          icon: Users,
          iconBg: "bg-navy-50",
          iconColor: "text-navy-600",
        },
        {
          label: "Travelers",
          value: stats.travelers,
          icon: UserCheck,
          iconBg: "bg-teal-50",
          iconColor: "text-teal-600",
        },
        {
          label: "Operators",
          value: stats.operators,
          icon: Briefcase,
          iconBg: "bg-amber-50",
          iconColor: "text-amber-600",
        },
        {
          label: "Admins",
          value: stats.admins,
          icon: Shield,
          iconBg: "bg-navy-50",
          iconColor: "text-navy-600",
        },
      ]
    : [];

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            User Management
          </h1>
          {data && (
            <p className="mt-1 text-sm text-navy-400">
              {data.total.toLocaleString()} total user{data.total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button
          onClick={() => window.open("/api/admin/export?type=users", "_blank")}
          className="inline-flex items-center gap-2 rounded-xl bg-navy-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-navy-800"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-2xl p-5 shadow-[var(--shadow-card)]"
            >
              <div className="mb-3 flex items-center justify-between">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.iconBg} ${s.iconColor}`}
                >
                  <s.icon size={20} />
                </div>
              </div>
              <p className="text-2xl font-bold text-navy-700">{s.value.toLocaleString()}</p>
              <p className="mt-1 text-sm text-navy-400">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Role filter */}
        <div className="relative">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as "" | Role)}
            className="appearance-none rounded-xl border border-cream-300 bg-white py-2.5 pl-4 pr-10 text-sm font-medium text-navy-700 shadow-sm transition-colors hover:border-navy-300 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-navy-400"
          />
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
          />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-cream-300 bg-white py-2.5 pl-10 pr-4 text-sm text-navy-700 shadow-sm transition-colors placeholder:text-navy-300 hover:border-navy-300 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-gold-500" />
          </div>
        ) : !data || data.users.length === 0 ? (
          <div className="py-20 text-center">
            <Users size={40} className="mx-auto mb-3 text-navy-200" />
            <p className="text-sm text-navy-400">No users found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-cream-200">
                    <th className="px-6 py-4 font-semibold text-navy-500">User</th>
                    <th className="px-6 py-4 font-semibold text-navy-500">Role</th>
                    <th className="px-6 py-4 font-semibold text-navy-500">Listings</th>
                    <th className="px-6 py-4 font-semibold text-navy-500">Bookings</th>
                    <th className="px-6 py-4 font-semibold text-navy-500">Joined</th>
                    <th className="px-6 py-4 font-semibold text-navy-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-cream-100 last:border-0 transition-colors hover:bg-cream-50"
                    >
                      {/* User cell */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar user={user} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-navy-700">
                              {user.name ?? "Unnamed"}
                            </p>
                            <p className="truncate text-xs text-navy-400">
                              {user.email}
                            </p>
                            {user.businessName && (
                              <p className="truncate text-xs text-gold-600">
                                {user.businessName}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Role badge */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                            ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>

                      {/* Listings */}
                      <td className="px-6 py-4 text-navy-600">
                        {user.role === "operator" ? (
                          <span className="font-medium">{user.listingCount}</span>
                        ) : (
                          <span className="text-navy-300">&mdash;</span>
                        )}
                      </td>

                      {/* Bookings */}
                      <td className="px-6 py-4 font-medium text-navy-600">
                        {user.bookingCount}
                      </td>

                      {/* Joined */}
                      <td className="px-6 py-4 text-navy-400">
                        {formatDate(user.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {/* Role change dropdown */}
                          <div className="relative">
                            {changingRole === user.id ? (
                              <Loader2
                                size={16}
                                className="animate-spin text-gold-500"
                              />
                            ) : (
                              <select
                                value={user.role}
                                onChange={(e) =>
                                  handleRoleChange(user.id, e.target.value as Role)
                                }
                                className="appearance-none rounded-lg border border-cream-300 bg-cream-50 py-1.5 pl-3 pr-8 text-xs font-medium text-navy-600 transition-colors hover:border-navy-300 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
                              >
                                <option value="traveler">Traveler</option>
                                <option value="operator">Operator</option>
                                <option value="admin">Admin</option>
                              </select>
                            )}
                          </div>

                          {/* View details */}
                          <button
                            onClick={() => setDetailUser(user)}
                            className="rounded-lg p-2 text-navy-400 transition-colors hover:bg-cream-100 hover:text-navy-600"
                            title="View details"
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-cream-200 px-6 py-4">
                <p className="text-sm text-navy-400">
                  Page {data.page} of {data.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-cream-300 px-3 py-1.5 text-sm font-medium text-navy-600 transition-colors hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                    Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page >= data.totalPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-cream-300 px-3 py-1.5 text-sm font-medium text-navy-600 transition-colors hover:bg-cream-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {detailUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailUser(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[var(--shadow-elevated)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center gap-4">
              <Avatar user={detailUser} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold text-navy-700">
                  {detailUser.name ?? "Unnamed User"}
                </h2>
                <p className="truncate text-sm text-navy-400">{detailUser.email}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  ROLE_COLORS[detailUser.role] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {detailUser.role}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-navy-400">User ID</span>
                <span className="font-mono text-xs text-navy-600">
                  {detailUser.id.slice(0, 12)}...
                </span>
              </div>
              {detailUser.businessName && (
                <div className="flex justify-between">
                  <span className="text-navy-400">Business</span>
                  <span className="font-medium text-navy-600">
                    {detailUser.businessName}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-navy-400">Listings</span>
                <span className="font-medium text-navy-600">
                  {detailUser.listingCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-400">Bookings</span>
                <span className="font-medium text-navy-600">
                  {detailUser.bookingCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-400">Joined</span>
                <span className="font-medium text-navy-600">
                  {formatDate(detailUser.createdAt)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setDetailUser(null)}
              className="mt-6 w-full rounded-xl bg-navy-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
