"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import {
  Gift,
  Send,
  CreditCard,
  Check,
  Loader2,
  DollarSign,
  Mail,
  User,
  MessageSquare,
} from "lucide-react";

const PRESET_AMOUNTS = [25, 50, 100, 200];

export default function GiftCardsPage() {
  const [activeTab, setActiveTab] = useState<"send" | "redeem">("send");

  // Send tab state
  const [selectedAmount, setSelectedAmount] = useState<number | null>(50);
  const [customAmount, setCustomAmount] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState("");

  // Redeem tab state
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemBalance, setRedeemBalance] = useState<number | null>(null);
  const [redeemError, setRedeemError] = useState("");

  const finalAmount = selectedAmount || parseFloat(customAmount) || 0;

  async function handlePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (finalAmount < 5) {
      setSendError("Minimum gift card amount is $5");
      return;
    }
    if (!recipientEmail) {
      setSendError("Please enter a recipient email");
      return;
    }

    setSendLoading(true);
    setSendError("");

    try {
      const res = await fetch("/api/payments/gift-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: finalAmount,
          recipientEmail,
          recipientName: recipientName || undefined,
          message: personalMessage || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSendError(data.error || "Failed to purchase gift card");
        return;
      }

      setSendSuccess(true);
    } catch {
      setSendError("Something went wrong. Please try again.");
    } finally {
      setSendLoading(false);
    }
  }

  async function handleCheckBalance() {
    if (!redeemCode.trim()) return;
    setRedeemLoading(true);
    setRedeemError("");
    setRedeemBalance(null);

    try {
      const res = await fetch(
        `/api/payments/gift-cards?code=${encodeURIComponent(redeemCode.trim())}`
      );
      const data = await res.json();

      if (!res.ok) {
        setRedeemError(data.error || "Invalid gift card code");
        return;
      }

      setRedeemBalance(data.balance);
    } catch {
      setRedeemError("Failed to check balance. Please try again.");
    } finally {
      setRedeemLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="pt-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-2xl px-6 py-10">
          {/* Page Header */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-gold-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Gift size={28} className="text-gold-600" />
            </div>
            <h1
              className="text-3xl md:text-4xl font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Gift Cards
            </h1>
            <p className="text-navy-400 mt-2 max-w-md mx-auto">
              Give the gift of Caribbean experiences. Perfect for birthdays,
              holidays, or just because.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-cream-100 rounded-xl p-1 mb-8">
            <button
              onClick={() => setActiveTab("send")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "send"
                  ? "bg-white text-navy-700 shadow-sm"
                  : "text-navy-400 hover:text-navy-600"
              }`}
            >
              <Send size={16} />
              Send a Gift Card
            </button>
            <button
              onClick={() => setActiveTab("redeem")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "redeem"
                  ? "bg-white text-navy-700 shadow-sm"
                  : "text-navy-400 hover:text-navy-600"
              }`}
            >
              <CreditCard size={16} />
              Redeem
            </button>
          </div>

          {/* Send Tab */}
          {activeTab === "send" && (
            <div className="bg-white rounded-2xl p-6 md:p-8 shadow-[var(--shadow-card)]">
              {sendSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check size={32} className="text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-navy-700">
                    Gift Card Sent!
                  </h2>
                  <p className="text-navy-400 mt-2">
                    A ${finalAmount} gift card has been sent to{" "}
                    {recipientEmail}.
                  </p>
                  <button
                    onClick={() => {
                      setSendSuccess(false);
                      setRecipientEmail("");
                      setRecipientName("");
                      setPersonalMessage("");
                      setSelectedAmount(50);
                      setCustomAmount("");
                    }}
                    className="mt-6 bg-gold-500 hover:bg-gold-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
                  >
                    Send Another
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePurchase} className="space-y-6">
                  {/* Amount Selection */}
                  <div>
                    <label className="text-sm font-semibold text-navy-700 block mb-3">
                      Select Amount
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {PRESET_AMOUNTS.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => {
                            setSelectedAmount(amount);
                            setCustomAmount("");
                          }}
                          className={`py-3 rounded-xl text-sm font-bold transition-all ${
                            selectedAmount === amount
                              ? "bg-gold-500 text-white shadow-[0_4px_20px_rgba(200,145,46,0.3)]"
                              : "bg-cream-50 text-navy-600 hover:bg-cream-100"
                          }`}
                        >
                          ${amount}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center gap-2 bg-cream-50 rounded-xl px-4 py-3">
                        <DollarSign
                          size={16}
                          className="text-navy-300 shrink-0"
                        />
                        <input
                          type="number"
                          placeholder="Custom amount"
                          value={customAmount}
                          onChange={(e) => {
                            setCustomAmount(e.target.value);
                            setSelectedAmount(null);
                          }}
                          min="5"
                          max="1000"
                          className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recipient Details */}
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-navy-700 block">
                      Recipient Details
                    </label>
                    <div className="flex items-center gap-2 bg-cream-50 rounded-xl px-4 py-3">
                      <Mail size={16} className="text-navy-300 shrink-0" />
                      <input
                        type="email"
                        required
                        placeholder="Recipient email"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-cream-50 rounded-xl px-4 py-3">
                      <User size={16} className="text-navy-300 shrink-0" />
                      <input
                        type="text"
                        placeholder="Recipient name (optional)"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm"
                      />
                    </div>
                  </div>

                  {/* Personal Message */}
                  <div>
                    <label className="text-sm font-semibold text-navy-700 block mb-2">
                      Personal Message (optional)
                    </label>
                    <div className="flex gap-2 bg-cream-50 rounded-xl px-4 py-3">
                      <MessageSquare
                        size={16}
                        className="text-navy-300 shrink-0 mt-0.5"
                      />
                      <textarea
                        placeholder="Add a personal message..."
                        value={personalMessage}
                        onChange={(e) => setPersonalMessage(e.target.value)}
                        maxLength={500}
                        rows={3}
                        className="w-full bg-transparent text-navy-700 placeholder:text-navy-300 outline-none text-sm resize-none"
                      />
                    </div>
                  </div>

                  {/* Error */}
                  {sendError && (
                    <div
                      role="alert"
                      className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl"
                    >
                      {sendError}
                    </div>
                  )}

                  {/* Purchase Button */}
                  <button
                    type="submit"
                    disabled={sendLoading || finalAmount < 5}
                    className="w-full bg-gold-500 hover:bg-gold-600 disabled:opacity-60 text-white py-4 rounded-xl font-semibold transition-all duration-300 hover:shadow-[0_4px_20px_rgba(200,145,46,0.4)] flex items-center justify-center gap-2"
                  >
                    {sendLoading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        <Gift size={18} />
                        Purchase ${finalAmount > 0 ? finalAmount : "0"} Gift
                        Card
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Redeem Tab */}
          {activeTab === "redeem" && (
            <div className="bg-white rounded-2xl p-6 md:p-8 shadow-[var(--shadow-card)]">
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-semibold text-navy-700 block mb-3">
                    Enter Gift Card Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={redeemCode}
                      onChange={(e) =>
                        setRedeemCode(e.target.value.toUpperCase())
                      }
                      placeholder="XXXX-XXXX-XXXX"
                      className="flex-1 px-4 py-3 rounded-xl bg-cream-50 border border-cream-300 text-navy-700 placeholder:text-navy-300 outline-none focus:border-gold-500 text-sm font-mono tracking-wider"
                    />
                    <button
                      onClick={handleCheckBalance}
                      disabled={redeemLoading || !redeemCode.trim()}
                      className="px-6 py-3 bg-gold-500 hover:bg-gold-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
                    >
                      {redeemLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        "Check Balance"
                      )}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {redeemError && (
                  <div
                    role="alert"
                    className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl"
                  >
                    {redeemError}
                  </div>
                )}

                {/* Balance Display */}
                {redeemBalance !== null && (
                  <div className="bg-gradient-to-br from-gold-50 to-teal-50 rounded-2xl p-6 text-center">
                    <p className="text-sm font-medium text-navy-400 mb-1">
                      Available Balance
                    </p>
                    <p className="text-4xl font-bold text-navy-700">
                      ${redeemBalance.toFixed(2)}
                    </p>
                    <p className="text-xs text-navy-400 mt-3">
                      This balance will be automatically applied at checkout
                    </p>
                  </div>
                )}

                {/* Info */}
                <div className="bg-cream-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-navy-400">
                    <span className="font-semibold text-navy-600">
                      How it works:
                    </span>{" "}
                    Enter your gift card code during checkout to apply the
                    balance to any booking.
                  </p>
                  <p className="text-xs text-navy-400">
                    Gift cards never expire and can be used across all VakayGo
                    experiences.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
