"use client";

import { DollarSign, Download, CreditCard } from "lucide-react";

export default function OperatorPayoutsPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-3xl font-bold text-navy-700"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Payouts
          </h1>
          <p className="text-navy-400 mt-1">
            Track your earnings and payout history
          </p>
        </div>
        <button className="flex items-center gap-2 bg-white text-navy-600 px-4 py-2.5 rounded-xl shadow-sm hover:bg-cream-50 transition-colors text-sm font-medium">
          <Download size={16} />
          Export
        </button>
      </div>

      {/* Earnings Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gold-50 rounded-xl flex items-center justify-center">
              <DollarSign size={20} className="text-gold-600" />
            </div>
            <p className="text-sm text-navy-400">Available Balance</p>
          </div>
          <p className="text-3xl font-bold text-navy-700">$0.00</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
              <DollarSign size={20} className="text-teal-600" />
            </div>
            <p className="text-sm text-navy-400">Total Earned</p>
          </div>
          <p className="text-3xl font-bold text-navy-700">$0.00</p>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-navy-50 rounded-xl flex items-center justify-center">
              <DollarSign size={20} className="text-navy-600" />
            </div>
            <p className="text-sm text-navy-400">Pending</p>
          </div>
          <p className="text-3xl font-bold text-navy-700">$0.00</p>
        </div>
      </div>

      {/* Payout Method */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-8">
        <h2 className="font-bold text-navy-700 mb-4">Payout Method</h2>
        <div className="flex items-center gap-4 p-4 rounded-xl bg-cream-50">
          <CreditCard size={24} className="text-navy-300" />
          <div className="flex-1">
            <p className="text-navy-700 font-medium">No payout method configured</p>
            <p className="text-sm text-navy-400">
              Add a bank account or payment method to receive payouts
            </p>
          </div>
          <button className="bg-gold-500 hover:bg-gold-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            Add Method
          </button>
        </div>
      </div>

      {/* Payout Schedule */}
      <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-8">
        <h2 className="font-bold text-navy-700 mb-2">Payout Schedule</h2>
        <p className="text-sm text-navy-400">
          Payouts are processed <span className="font-semibold text-navy-600">weekly</span> every
          Monday for all completed bookings. Funds typically arrive within 2-3
          business days.
        </p>
        <div className="mt-4 p-4 bg-teal-50 rounded-xl">
          <p className="text-sm text-teal-700">
            <span className="font-semibold">VakayGo takes just 3% commission</span> — the lowest
            in the travel industry. You keep 97% of every booking.
          </p>
        </div>
      </div>

      {/* Empty History */}
      <div className="bg-white rounded-2xl p-12 shadow-[var(--shadow-card)] text-center">
        <DollarSign size={40} className="text-navy-200 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-navy-700">No payouts yet</h3>
        <p className="text-navy-400 mt-2">
          Once you receive and complete bookings, your earnings will appear here.
        </p>
      </div>
    </div>
  );
}
