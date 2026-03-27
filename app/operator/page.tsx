"use client";

import {
  DollarSign,
  CalendarCheck,
  Star,
  TrendingUp,
  Eye,
  ListPlus,
} from "lucide-react";

const stats = [
  {
    label: "Total Revenue",
    value: "$0.00",
    change: "Starting fresh",
    icon: DollarSign,
    color: "bg-gold-50 text-gold-600",
  },
  {
    label: "Bookings",
    value: "0",
    change: "This month",
    icon: CalendarCheck,
    color: "bg-teal-50 text-teal-600",
  },
  {
    label: "Avg Rating",
    value: "—",
    change: "No reviews yet",
    icon: Star,
    color: "bg-gold-50 text-gold-600",
  },
  {
    label: "Profile Views",
    value: "0",
    change: "This week",
    icon: Eye,
    color: "bg-teal-50 text-teal-600",
  },
];

export default function OperatorDashboard() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-3xl font-bold text-navy-700"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Dashboard
        </h1>
        <p className="text-navy-400 mt-1">
          Welcome to your VakayGo business dashboard
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color}`}
              >
                <stat.icon size={20} />
              </div>
              <TrendingUp size={16} className="text-navy-200" />
            </div>
            <p className="text-2xl font-bold text-navy-700">{stat.value}</p>
            <p className="text-sm text-navy-400 mt-1">{stat.label}</p>
            <p className="text-xs text-navy-300 mt-2">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Getting Started */}
      <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)]">
        <h2 className="text-xl font-bold text-navy-700 mb-6">
          Get started with VakayGo
        </h2>
        <div className="space-y-4">
          {[
            {
              step: "1",
              title: "Create your first listing",
              description:
                "Add your stay, tour, restaurant, event, or service to start reaching travelers.",
              action: "Create Listing",
              href: "/operator/listings/new",
              icon: ListPlus,
            },
            {
              step: "2",
              title: "Add photos",
              description:
                "High-quality photos are the #1 factor in getting bookings. Add at least 5.",
              action: "Upload Photos",
              href: "#",
              icon: Eye,
            },
            {
              step: "3",
              title: "Set your pricing",
              description:
                "Configure your rates, availability, and cancellation policy.",
              action: "Set Pricing",
              href: "#",
              icon: DollarSign,
            },
            {
              step: "4",
              title: "Go live",
              description:
                "Submit your listing for review. We'll publish it within 24 hours.",
              action: "Submit",
              href: "#",
              icon: CalendarCheck,
            },
          ].map((item) => (
            <div
              key={item.step}
              className="flex items-center gap-4 p-4 rounded-xl bg-cream-50 hover:bg-cream-100 transition-colors"
            >
              <div className="w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                {item.step}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-navy-700">{item.title}</h3>
                <p className="text-sm text-navy-400 mt-0.5">
                  {item.description}
                </p>
              </div>
              <a
                href={item.href}
                className="shrink-0 text-sm font-semibold text-gold-500 hover:text-gold-600"
              >
                {item.action} →
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
