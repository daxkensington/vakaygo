"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";
import {
  Star,
  Gift,
  Copy,
  Check,
  Users,
  TrendingUp,
  Award,
  ArrowRight,
  Loader2,
  Lock,
  Mail,
  Share2,
  Trophy,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { LoyaltyBadge } from "@/components/shared/loyalty-badge";

type LoyaltyData = {
  points: number;
  tier: string;
  tierInfo: { name: string; minPoints: number; maxPoints: number; discount: number; color: string };
  nextTier: {
    tier: string;
    pointsNeeded: number;
    pointsRemaining: number;
    tierInfo: { name: string; minPoints: number; maxPoints: number; discount: number; color: string };
  } | null;
  referralCode: string | null;
  discount: number;
  transactions: Array<{
    id: string;
    type: string;
    points: number;
    description: string | null;
    createdAt: string;
  }>;
  page: number;
  hasMore: boolean;
};

type ReferralStats = {
  referralCode: string | null;
  referralLink: string | null;
  stats: {
    invited: number;
    signedUp: number;
    booked: number;
    totalEarned: number;
  };
};

const tierEmojis: Record<string, string> = {
  explorer: "\uD83C\uDF0D",
  adventurer: "\uD83C\uDFD4\uFE0F",
  voyager: "\u26F5",
  captain: "\uD83D\uDC51",
};

const tierColors: Record<string, { gradient: string; ring: string; bg: string }> = {
  explorer: { gradient: "from-gray-400 to-gray-500", ring: "ring-gray-300", bg: "bg-gray-50" },
  adventurer: { gradient: "from-blue-500 to-blue-600", ring: "ring-blue-300", bg: "bg-blue-50" },
  voyager: { gradient: "from-purple-500 to-purple-600", ring: "ring-purple-300", bg: "bg-purple-50" },
  captain: { gradient: "from-amber-500 to-amber-600", ring: "ring-amber-300", bg: "bg-amber-50" },
};

const typeIcons: Record<string, { icon: string; color: string }> = {
  earned_booking: { icon: "\uD83D\uDCB3", color: "text-teal-600" },
  earned_review: { icon: "\u2B50", color: "text-gold-600" },
  earned_referral: { icon: "\uD83E\uDD1D", color: "text-blue-600" },
  redeemed: { icon: "\uD83C\uDF81", color: "text-red-500" },
  expired: { icon: "\u23F0", color: "text-gray-400" },
  bonus: { icon: "\uD83C\uDF89", color: "text-purple-600" },
};

const tiers = [
  { key: "explorer", name: "Explorer", points: "0-999", emoji: "\uD83C\uDF0D", benefits: ["Base level", "Earn 10 points per $1 spent", "Track your rewards progress"] },
  { key: "adventurer", name: "Adventurer", points: "1,000-4,999", emoji: "\uD83C\uDFD4\uFE0F", benefits: ["2% discount on service fees", "All Explorer benefits", "Exclusive member deals"] },
  { key: "voyager", name: "Voyager", points: "5,000-14,999", emoji: "\u26F5", benefits: ["5% discount on service fees", "Priority support badge", "All Adventurer benefits"] },
  { key: "captain", name: "Captain", points: "15,000+", emoji: "\uD83D\uDC51", benefits: ["10% discount on service fees", "Priority support", "Early access to new listings", "All Voyager benefits"] },
];

export default function RewardsPage() {
  const { user, loading: authLoading } = useAuth();
  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const [referrals, setReferrals] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "earned" | "redeemed">("all");
  const [copied, setCopied] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [loyaltyRes, referralRes] = await Promise.all([
        fetch(`/api/loyalty?filter=${filter}`),
        fetch("/api/referrals"),
      ]);

      if (loyaltyRes.ok) {
        setLoyalty(await loyaltyRes.json());
      }
      if (referralRes.ok) {
        setReferrals(await referralRes.json());
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (user) fetchData();
    else setLoading(false);
  }, [user, fetchData]);

  async function generateCode() {
    setGeneratingCode(true);
    try {
      const res = await fetch("/api/referrals", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReferrals((prev) => prev ? { ...prev, referralCode: data.referralCode, referralLink: data.referralLink } : prev);
      }
    } catch {
      // Silent
    } finally {
      setGeneratingCode(false);
    }
  }

  function copyReferralLink() {
    if (!referrals?.referralLink) return;
    navigator.clipboard.writeText(referrals.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (authLoading || loading) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex items-center justify-center bg-cream-50">
          <Loader2 size={32} className="animate-spin text-gold-500" />
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header />
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream-50 px-6 pt-20">
          <Lock size={48} className="text-navy-200 mb-6" />
          <h1 className="text-2xl font-bold text-navy-700">Sign in to view rewards</h1>
          <p className="text-navy-400 mt-2">Earn points on every booking and unlock exclusive perks.</p>
          <Link href="/auth/signin" className="mt-6 bg-gold-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gold-800 transition-colors">
            Sign In
          </Link>
        </div>
      </>
    );
  }

  const points = loyalty?.points || 0;
  const tier = (loyalty?.tier || "explorer") as string;
  const colors = tierColors[tier] || tierColors.explorer;
  const nextTier = loyalty?.nextTier;
  const progressPercent = nextTier
    ? Math.min(100, ((points - (loyalty?.tierInfo?.minPoints || 0)) / (nextTier.pointsNeeded - (loyalty?.tierInfo?.minPoints || 0))) * 100)
    : 100;

  return (
    <>
      <Header />
      <div className="min-h-screen bg-cream-50 pt-20">
        <div className="mx-auto max-w-5xl px-4 md:px-6 py-10">

          {/* ─── HERO SECTION ─────────────────────────────────── */}
          <div className={`relative overflow-hidden bg-gradient-to-br ${colors.gradient} rounded-3xl p-8 md:p-12 text-white mb-10`}>
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-20 translate-x-20" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-16 -translate-x-16" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-4xl">{tierEmojis[tier] || tierEmojis.explorer}</span>
                  <div>
                    <p className="text-white/70 text-sm font-medium uppercase tracking-wider">Your Rewards</p>
                    <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                      {points.toLocaleString()} Points
                    </h1>
                  </div>
                </div>

                <p className="text-white/80 text-lg">
                  {loyalty?.tierInfo?.name || "Explorer"} Member
                  {loyalty?.discount ? ` — ${(loyalty.discount * 100).toFixed(0)}% fee discount active` : ""}
                </p>

                {nextTier && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between text-sm text-white/70 mb-2">
                      <span>{nextTier.pointsRemaining.toLocaleString()} points to {nextTier.tierInfo.name}</span>
                      <span>{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="w-full max-w-md h-3 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full transition-all duration-1000"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {!nextTier && (
                  <p className="mt-4 text-white/70 flex items-center gap-2">
                    <Trophy size={16} />
                    You have reached the highest tier!
                  </p>
                )}
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-center min-w-[180px]">
                <p className="text-white/60 text-xs uppercase tracking-wider mb-1">Points Value</p>
                <p className="text-3xl font-bold">${(points / 100).toFixed(2)}</p>
                <p className="text-white/60 text-xs mt-1">in booking credit</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ─── LEFT COLUMN: HISTORY + TIERS ────────────── */}
            <div className="lg:col-span-2 space-y-8">

              {/* Points History */}
              <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
                <div className="flex items-center justify-between p-6 pb-4">
                  <h2 className="text-lg font-bold text-navy-700">Points History</h2>
                  <div className="flex gap-1 bg-cream-100 rounded-lg p-1">
                    {(["all", "earned", "redeemed"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          filter === f
                            ? "bg-white text-navy-700 shadow-sm"
                            : "text-navy-400 hover:text-navy-600"
                        }`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-cream-100">
                  {loyalty?.transactions && loyalty.transactions.length > 0 ? (
                    loyalty.transactions.map((tx) => {
                      const typeInfo = typeIcons[tx.type] || { icon: "\u2022", color: "text-gray-500" };
                      const isPositive = tx.points > 0;

                      return (
                        <div key={tx.id} className="flex items-center gap-4 px-6 py-4">
                          <span className="text-xl w-8 text-center">{typeInfo.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-navy-700 truncate">
                              {tx.description || tx.type.replace(/_/g, " ")}
                            </p>
                            <p className="text-xs text-navy-400 mt-0.5">
                              {new Date(tx.createdAt).toLocaleDateString("en-US", {
                                month: "short", day: "numeric", year: "numeric",
                              })}
                            </p>
                          </div>
                          <span className={`text-sm font-bold ${isPositive ? "text-teal-600" : "text-red-500"}`}>
                            {isPositive ? "+" : ""}{tx.points.toLocaleString()}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-6 py-12 text-center">
                      <Sparkles size={32} className="text-navy-200 mx-auto mb-4" />
                      <p className="text-navy-400">No transactions yet.</p>
                      <p className="text-navy-300 text-sm mt-1">Book an experience to start earning points!</p>
                      <Link
                        href="/explore"
                        className="inline-flex items-center gap-2 mt-4 text-gold-500 font-medium text-sm hover:text-gold-600"
                      >
                        Explore Listings <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── TIER LADDER ────────────────────────────── */}
              <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
                <h2 className="text-lg font-bold text-navy-700 mb-6">Tier Benefits</h2>
                <div className="space-y-4">
                  {tiers.map((t) => {
                    const isCurrent = t.key === tier;
                    const isLocked = tiers.indexOf(t) > tiers.findIndex((x) => x.key === tier);

                    return (
                      <div
                        key={t.key}
                        className={`relative rounded-xl p-5 border-2 transition-all ${
                          isCurrent
                            ? "border-gold-400 bg-gold-50/50 shadow-[0_0_20px_rgba(200,145,46,0.1)]"
                            : isLocked
                            ? "border-cream-200 bg-cream-50 opacity-60"
                            : "border-teal-200 bg-teal-50/30"
                        }`}
                      >
                        {isCurrent && (
                          <span className="absolute -top-3 right-4 bg-gold-700 text-white text-xs font-bold px-3 py-1 rounded-full">
                            You are here
                          </span>
                        )}
                        <div className="flex items-start gap-4">
                          <span className="text-3xl">{t.emoji}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-navy-700">{t.name}</h3>
                              <span className="text-xs text-navy-400">{t.points} pts</span>
                            </div>
                            <ul className="mt-2 space-y-1">
                              {t.benefits.map((b, i) => (
                                <li key={i} className="text-sm text-navy-500 flex items-center gap-2">
                                  <Check size={14} className={isCurrent ? "text-gold-500" : "text-teal-500"} />
                                  {b}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ─── RIGHT COLUMN: REFERRAL ──────────────────── */}
            <div className="space-y-8">

              {/* How to Earn */}
              <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
                <h2 className="text-lg font-bold text-navy-700 mb-4">How to Earn</h2>
                <div className="space-y-3">
                  {[
                    { icon: "\uD83D\uDCB3", label: "Complete a booking", value: "10 pts/$1" },
                    { icon: "\u2B50", label: "Leave a review", value: "100 pts" },
                    { icon: "\uD83E\uDD1D", label: "Refer a friend", value: "500 pts each" },
                    { icon: "\uD83C\uDF89", label: "First booking bonus", value: "200 pts" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-lg w-8 text-center">{item.icon}</span>
                      <span className="flex-1 text-sm text-navy-600">{item.label}</span>
                      <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded-full">
                        +{item.value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-cream-100 text-xs text-navy-400">
                  <p>1,000 points = $10 credit. Min redemption: 500 pts ($5).</p>
                  <p className="mt-1">Points expire after 12 months of inactivity.</p>
                </div>
              </div>

              {/* Referral Section */}
              <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Gift size={20} className="text-gold-500" />
                  <h2 className="text-lg font-bold text-navy-700">Invite Friends</h2>
                </div>
                <p className="text-sm text-navy-500 mb-4">
                  Share your link and earn 500 points when your friend completes their first booking. They get 500 points too!
                </p>

                {referrals?.referralCode ? (
                  <>
                    <div className="flex items-center gap-2 bg-cream-50 rounded-xl px-4 py-3 mb-4">
                      <code className="flex-1 text-sm text-navy-700 font-mono truncate">
                        {referrals.referralLink}
                      </code>
                      <button
                        onClick={copyReferralLink}
                        className="shrink-0 p-2 hover:bg-cream-200 rounded-lg transition-colors"
                      >
                        {copied ? (
                          <Check size={16} className="text-teal-500" />
                        ) : (
                          <Copy size={16} className="text-navy-400" />
                        )}
                      </button>
                    </div>

                    {/* Share buttons */}
                    <div className="flex gap-2 mb-6">
                      <a
                        href={`https://wa.me/?text=Join%20VakayGo%20and%20get%20500%20bonus%20points!%20${encodeURIComponent(referrals.referralLink || "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
                      >
                        <Share2 size={14} />
                        WhatsApp
                      </a>
                      <a
                        href={`mailto:?subject=Join%20VakayGo&body=Hey!%20Join%20VakayGo%20and%20get%20500%20bonus%20points%20on%20your%20first%20booking.%20${encodeURIComponent(referrals.referralLink || "")}`}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-navy-500 hover:bg-navy-600 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
                      >
                        <Mail size={14} />
                        Email
                      </a>
                      <a
                        href={`https://twitter.com/intent/tweet?text=Join%20VakayGo%20for%20the%20best%20Caribbean%20travel%20deals!%20${encodeURIComponent(referrals.referralLink || "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
                      >
                        <Share2 size={14} />
                        Twitter
                      </a>
                    </div>

                    {/* Referral stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-cream-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-navy-700">{referrals.stats.invited}</p>
                        <p className="text-xs text-navy-400">Invited</p>
                      </div>
                      <div className="bg-cream-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-navy-700">{referrals.stats.signedUp}</p>
                        <p className="text-xs text-navy-400">Signed Up</p>
                      </div>
                      <div className="bg-cream-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-navy-700">{referrals.stats.booked}</p>
                        <p className="text-xs text-navy-400">Booked</p>
                      </div>
                      <div className="bg-teal-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-teal-600">{referrals.stats.totalEarned.toLocaleString()}</p>
                        <p className="text-xs text-navy-400">Pts Earned</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={generateCode}
                    disabled={generatingCode}
                    className="w-full bg-gold-700 hover:bg-gold-800 disabled:opacity-60 text-white py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    {generatingCode ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Gift size={16} />
                        Get Your Referral Link
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Quick Redeem */}
              {points >= 500 && (
                <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl p-6 text-white">
                  <h3 className="font-bold mb-2">Ready to Redeem?</h3>
                  <p className="text-teal-100 text-sm mb-4">
                    You have {points.toLocaleString()} points (${(points / 100).toFixed(2)} credit). Use them on your next booking!
                  </p>
                  <Link
                    href="/explore"
                    className="inline-flex items-center gap-2 bg-white text-teal-600 px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-teal-50 transition-colors"
                  >
                    Book Now <ChevronRight size={14} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
