// Loyalty tier definitions — shared between client and server
// This file contains NO database/server imports so it can be used in client components

export const LOYALTY_TIERS = {
  explorer: { name: "Explorer", minPoints: 0, maxPoints: 999, discount: 0, emoji: "globe_showing_americas", color: "gray" },
  adventurer: { name: "Adventurer", minPoints: 1000, maxPoints: 4999, discount: 0.02, emoji: "mountain", color: "blue" },
  voyager: { name: "Voyager", minPoints: 5000, maxPoints: 14999, discount: 0.05, emoji: "sailboat", color: "purple" },
  captain: { name: "Captain", minPoints: 15000, maxPoints: Infinity, discount: 0.10, emoji: "crown", color: "gold" },
} as const;

export type LoyaltyTier = keyof typeof LOYALTY_TIERS;
