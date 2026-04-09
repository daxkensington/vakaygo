import {
  pgTable,
  pgEnum,
  text,
  varchar,
  integer,
  serial,
  boolean,
  timestamp,
  decimal,
  json,
  uuid,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── ENUMS ──────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", [
  "traveler",
  "operator",
  "admin",
]);

export const listingTypeEnum = pgEnum("listing_type", [
  "stay",
  "tour",
  "dining",
  "event",
  "transport",
  "guide",
  "excursion",
  "transfer",
  "vip",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "refunded",
  "no_show",
]);

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "pending_review",
  "active",
  "paused",
  "rejected",
]);

// ─── ISLANDS / DESTINATIONS ─────────────────────────────────────
export const islands = pgTable("islands", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  country: varchar("country", { length: 128 }).notNull(),
  region: varchar("region", { length: 128 }).default("Caribbean"),
  description: text("description"),
  heroImage: text("hero_image"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  timezone: varchar("timezone", { length: 64 }),
  currency: varchar("currency", { length: 8 }).default("XCD"),
  isActive: boolean("is_active").default(false).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── USERS ──────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    name: varchar("name", { length: 256 }),
    phone: varchar("phone", { length: 20 }),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").default("traveler").notNull(),
    passwordHash: text("password_hash"),
    emailVerified: boolean("email_verified").default(false),
    emailVerificationToken: varchar("email_verification_token", { length: 128 }),
    emailVerificationExpires: timestamp("email_verification_expires"),
    businessName: varchar("business_name", { length: 256 }),
    businessDescription: text("business_description"),
    businessPhone: varchar("business_phone", { length: 20 }),
    businessLogo: text("business_logo"),
    islandId: integer("island_id").references(() => islands.id),
    digipayMerchantId: varchar("digipay_merchant_id", { length: 128 }),
    onboardingComplete: boolean("onboarding_complete").default(false),
    isSuperhost: boolean("is_superhost").default(false),
    superhostSince: timestamp("superhost_since"),
    loyaltyPoints: integer("loyalty_points").default(0),
    loyaltyTier: varchar("loyalty_tier", { length: 16 }).default("explorer"), // explorer, adventurer, voyager, captain
    referralCode: varchar("referral_code", { length: 16 }),
    referredBy: uuid("referred_by"),
    // 2FA / Trust & Safety
    totpSecret: varchar("totp_secret", { length: 256 }),
    totpEnabled: boolean("totp_enabled").default(false),
    phoneVerified: boolean("phone_verified").default(false),
    idVerified: boolean("id_verified").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("users_email_idx").on(t.email),
    index("users_role_idx").on(t.role),
  ]
);

// ─── AUTH ACCOUNTS (NextAuth adapter) ───────────────────────────
export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 256 }).notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: varchar("token_type", { length: 64 }),
  scope: text("scope"),
  idToken: text("id_token"),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sessionToken: varchar("session_token", { length: 512 }).notNull().unique(),
  expires: timestamp("expires").notNull(),
});

// ─── CATEGORIES & TAGS ──────────────────────────────────────────
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 256 }).notNull(),
  listingType: listingTypeEnum("listing_type").notNull(),
  icon: varchar("icon", { length: 64 }),
  sortOrder: integer("sort_order").default(0),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  group: varchar("group", { length: 64 }),
});

// ─── LISTINGS ───────────────────────────────────────────────────
export const listings = pgTable(
  "listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => users.id),
    islandId: integer("island_id")
      .notNull()
      .references(() => islands.id),
    categoryId: integer("category_id").references(() => categories.id),
    type: listingTypeEnum("type").notNull(),
    status: listingStatusEnum("status").default("draft").notNull(),
    title: varchar("title", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 300 }).notNull(),
    headline: varchar("headline", { length: 512 }),
    description: text("description"),
    address: text("address"),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    parish: varchar("parish", { length: 128 }),
    priceAmount: decimal("price_amount", { precision: 10, scale: 2 }),
    priceCurrency: varchar("price_currency", { length: 8 }).default("XCD"),
    priceUnit: varchar("price_unit", { length: 32 }),
    priceFrom: boolean("price_from").default(false),
    // Type-specific data stored as JSON
    typeData: json("type_data").$type<Record<string, unknown>>(),
    // Cancellation policy: flexible, moderate, strict, non_refundable
    cancellationPolicy: varchar("cancellation_policy", { length: 32 }).default("moderate"),
    // Booking rules
    minStay: integer("min_stay"),
    maxStay: integer("max_stay"),
    advanceNotice: integer("advance_notice"),
    maxGuests: integer("max_guests"),
    avgRating: decimal("avg_rating", { precision: 3, scale: 2 }).default(
      "0.00"
    ),
    reviewCount: integer("review_count").default(0),
    isFeatured: boolean("is_featured").default(false),
    isInstantBook: boolean("is_instant_book").default(false),
    metaTitle: varchar("meta_title", { length: 256 }),
    metaDescription: varchar("meta_description", { length: 512 }),
    // Video & meeting point
    videoUrl: text("video_url"),
    meetingPointLat: decimal("meeting_point_lat", { precision: 10, scale: 7 }),
    meetingPointLng: decimal("meeting_point_lng", { precision: 10, scale: 7 }),
    meetingPointNote: varchar("meeting_point_note", { length: 512 }),
    // Dining-specific
    cuisineType: varchar("cuisine_type", { length: 64 }),
    operatingHours: json("operating_hours").$type<Record<string, { open: string; close: string }>>(),
    // iCal sync
    icalToken: varchar("ical_token", { length: 128 }),
    icalImportUrl: text("ical_import_url"),
    icalLastSync: timestamp("ical_last_sync"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("listings_operator_idx").on(t.operatorId),
    index("listings_island_idx").on(t.islandId),
    index("listings_type_idx").on(t.type),
    index("listings_status_idx").on(t.status),
    uniqueIndex("listings_slug_island_idx").on(t.slug, t.islandId),
  ]
);

// ─── LISTING TAGS (many-to-many) ────────────────────────────────
export const listingTags = pgTable(
  "listing_tags",
  {
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.listingId, t.tagId] }),
    index("listing_tags_listing_idx").on(t.listingId),
  ]
);

// ─── MEDIA ──────────────────────────────────────────────────────
export const media = pgTable(
  "media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: varchar("alt", { length: 256 }),
    type: varchar("type", { length: 16 }).default("image"),
    sortOrder: integer("sort_order").default(0),
    isPrimary: boolean("is_primary").default(false),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("media_listing_idx").on(t.listingId)]
);

// ─── AVAILABILITY ───────────────────────────────────────────────
export const availability = pgTable(
  "availability",
  {
    id: serial("id").primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    date: timestamp("date").notNull(),
    spots: integer("spots"),
    spotsRemaining: integer("spots_remaining"),
    priceOverride: decimal("price_override", { precision: 10, scale: 2 }),
    isBlocked: boolean("is_blocked").default(false),
  },
  (t) => [index("availability_listing_date_idx").on(t.listingId, t.date)]
);

// ─── BOOKINGS ───────────────────────────────────────────────────
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingNumber: varchar("booking_number", { length: 32 }).notNull().unique(),
    travelerId: uuid("traveler_id")
      .notNull()
      .references(() => users.id),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => users.id),
    status: bookingStatusEnum("status").default("pending").notNull(),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date"),
    guestCount: integer("guest_count").default(1),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    serviceFee: decimal("service_fee", { precision: 10, scale: 2 }).default(
      "0.00"
    ),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 8 }).default("XCD"),
    paymentMethod: varchar("payment_method", { length: 32 }),
    paymentId: varchar("payment_id", { length: 256 }),
    paidAt: timestamp("paid_at"),
    guestNotes: text("guest_notes"),
    operatorNotes: text("operator_notes"),
    cancellationReason: text("cancellation_reason"),
    verificationToken: varchar("verification_token", { length: 128 }),
    checkedIn: boolean("checked_in").default(false),
    checkedInAt: timestamp("checked_in_at"),
    promoCodeId: uuid("promo_code_id"),
    discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
    // Deposit & escrow
    depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }),
    depositPaid: boolean("deposit_paid").default(false),
    escrowReleased: boolean("escrow_released").default(false),
    escrowReleasedAt: timestamp("escrow_released_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("bookings_traveler_idx").on(t.travelerId),
    index("bookings_operator_idx").on(t.operatorId),
    index("bookings_listing_idx").on(t.listingId),
    index("bookings_status_idx").on(t.status),
  ]
);

// ─── REVIEWS ────────────────────────────────────────────────────
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id)
      .unique(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    travelerId: uuid("traveler_id")
      .notNull()
      .references(() => users.id),
    rating: integer("rating").notNull(),
    title: varchar("title", { length: 256 }),
    comment: text("comment"),
    operatorReply: text("operator_reply"),
    operatorRepliedAt: timestamp("operator_replied_at"),
    isPublished: boolean("is_published").default(true),
    helpfulCount: integer("helpful_count").default(0),
    isVerifiedPurchase: boolean("is_verified_purchase").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("reviews_listing_idx").on(t.listingId)]
);

// ─── REVIEW PHOTOS ─────────────────────────────────────────────
export const reviewPhotos = pgTable("review_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 256 }),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("review_photos_review_idx").on(t.reviewId),
]);

// ─── PAYOUTS ────────────────────────────────────────────────────
export const payouts = pgTable("payouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorId: uuid("operator_id")
    .notNull()
    .references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("XCD"),
  status: payoutStatusEnum("status").default("pending").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  bookingCount: integer("booking_count").default(0),
  paymentReference: varchar("payment_reference", { length: 256 }),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── AI TRIP PLANNER ────────────────────────────────────────────
export const trips = pgTable("trips", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  islandId: integer("island_id").references(() => islands.id),
  title: varchar("title", { length: 256 }).notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  guestCount: integer("guest_count").default(1),
  budget: varchar("budget", { length: 32 }),
  interests: json("interests").$type<string[]>(),
  isAiGenerated: boolean("is_ai_generated").default(false),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tripItems = pgTable("trip_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  listingId: uuid("listing_id").references(() => listings.id),
  dayNumber: integer("day_number").notNull(),
  timeSlot: varchar("time_slot", { length: 16 }),
  customTitle: varchar("custom_title", { length: 256 }),
  customNote: text("custom_note"),
  sortOrder: integer("sort_order").default(0),
});

// ─── SAVED / WISHLIST ───────────────────────────────────────────
export const savedListings = pgTable(
  "saved_listings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.listingId] }),
    index("saved_user_idx").on(t.userId),
  ]
);

// ─── WAITLIST (pre-launch) ──────────────────────────────────────
export const waitlist = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 256 }),
  type: varchar("type", { length: 16 }).default("traveler"),
  businessName: varchar("business_name", { length: 256 }),
  island: varchar("island", { length: 128 }),
  source: varchar("source", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── MESSAGES (traveler <-> operator) ───────────────────────────
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => users.id),
    listingId: uuid("listing_id").references(() => listings.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    content: text("content").notNull(),
    attachmentUrl: text("attachment_url"),
    attachmentType: varchar("attachment_type", { length: 16 }), // image, file
    // Translation
    translatedContent: text("translated_content"),
    sourceLanguage: varchar("source_language", { length: 8 }),
    targetLanguage: varchar("target_language", { length: 8 }),
    isRead: boolean("is_read").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("messages_sender_idx").on(t.senderId),
    index("messages_receiver_idx").on(t.receiverId),
    index("messages_listing_idx").on(t.listingId),
  ]
);

// ─── LISTING VIEWS (analytics) ────────────────────────────────
export const listingViews = pgTable("listing_views", {
  id: serial("id").primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  viewerIp: varchar("viewer_ip", { length: 64 }),
  userId: uuid("user_id").references(() => users.id),
  source: varchar("source", { length: 32 }), // explore, search, direct, island
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("listing_views_listing_idx").on(t.listingId),
  index("listing_views_created_idx").on(t.createdAt),
]);

// ─── NOTIFICATIONS ─────────────────────────────────────────────
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 32 }).notNull(), // booking, review, message, system
  title: varchar("title", { length: 256 }).notNull(),
  body: text("body"),
  link: varchar("link", { length: 512 }), // where to navigate on click
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("notifications_user_idx").on(t.userId),
  index("notifications_user_read_idx").on(t.userId, t.isRead),
]);

// ─── PUSH SUBSCRIPTIONS ──────────────────────────────────────
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("push_sub_user_idx").on(t.userId),
]);

// ─── PLATFORM SETTINGS (CMS) ──────────────────────────────
export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── DISPUTES ─────────────────────────────────────────────────
export const disputeStatusEnum = pgEnum("dispute_status", [
  "open", "under_review", "resolved_traveler", "resolved_operator", "closed"
]);

export const disputes = pgTable("disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  filedBy: uuid("filed_by").notNull().references(() => users.id),
  operatorId: uuid("operator_id").notNull().references(() => users.id),
  status: disputeStatusEnum("status").default("open").notNull(),
  reason: varchar("reason", { length: 64 }).notNull(),
  description: text("description").notNull(),
  adminNotes: text("admin_notes"),
  resolution: text("resolution"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("disputes_booking_idx").on(t.bookingId),
  index("disputes_status_idx").on(t.status),
]);

// ─── BLOG POSTS ──────────────────────────────────────────────
export const blogPostStatusEnum = pgEnum("blog_post_status", ["draft", "published", "archived"]);

export const blogPosts = pgTable("blog_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 300 }).notNull().unique(),
  title: varchar("title", { length: 256 }).notNull(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  coverImage: text("cover_image"),
  authorId: uuid("author_id").notNull().references(() => users.id),
  islandId: integer("island_id").references(() => islands.id),
  category: varchar("category", { length: 64 }).notNull(),
  tags: json("tags").$type<string[]>(),
  status: blogPostStatusEnum("status").default("draft").notNull(),
  metaTitle: varchar("meta_title", { length: 256 }),
  metaDescription: varchar("meta_description", { length: 512 }),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("blog_posts_slug_idx").on(t.slug),
  index("blog_posts_status_idx").on(t.status),
  index("blog_posts_island_idx").on(t.islandId),
  index("blog_posts_category_idx").on(t.category),
]);

// ─── AUDIT LOG ────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  adminId: uuid("admin_id").notNull().references(() => users.id),
  action: varchar("action", { length: 64 }).notNull(),
  targetType: varchar("target_type", { length: 32 }).notNull(),
  targetId: varchar("target_id", { length: 128 }),
  details: json("details").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("audit_log_admin_idx").on(t.adminId),
  index("audit_log_created_idx").on(t.createdAt),
]);

// ─── LOYALTY TRANSACTIONS ─────────────────────────────────────
export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 32 }).notNull(), // "earned_booking", "earned_review", "earned_referral", "redeemed", "expired", "bonus"
  points: integer("points").notNull(), // positive for earned, negative for redeemed
  description: text("description"),
  bookingId: uuid("booking_id").references(() => bookings.id),
  referralId: uuid("referral_id"),
  expiresAt: timestamp("expires_at"), // points expire after 12 months
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("loyalty_user_idx").on(t.userId),
  index("loyalty_created_idx").on(t.createdAt),
]);

// ─── REFERRALS ────────────────────────────────────────────────
export const referrals = pgTable("referrals", {
  id: uuid("id").defaultRandom().primaryKey(),
  referrerId: uuid("referrer_id").notNull().references(() => users.id),
  referredId: uuid("referred_id").references(() => users.id), // null until they sign up
  referredEmail: varchar("referred_email", { length: 320 }),
  code: varchar("code", { length: 16 }).notNull().unique(),
  status: varchar("status", { length: 16 }).default("pending").notNull(), // pending, signed_up, first_booking, rewarded
  referrerReward: integer("referrer_reward").default(500), // points
  referredReward: integer("referred_reward").default(500), // points
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (t) => [
  index("referrals_referrer_idx").on(t.referrerId),
  index("referrals_code_idx").on(t.code),
]);

// ─── PROMO CODES ──────────────────────────────────────────────
export const promoCodes = pgTable("promo_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  description: text("description"),
  discountType: varchar("discount_type", { length: 16 }).notNull(), // "percentage" or "fixed"
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("XCD"),
  minOrderAmount: decimal("min_order_amount", { precision: 10, scale: 2 }),
  maxDiscountAmount: decimal("max_discount_amount", { precision: 10, scale: 2 }),
  maxUses: integer("max_uses"),
  currentUses: integer("current_uses").default(0),
  maxUsesPerUser: integer("max_uses_per_user").default(1),
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until").notNull(),
  applicableTypes: json("applicable_types").$type<string[]>(),
  applicableIslands: json("applicable_islands").$type<number[]>(),
  isActive: boolean("is_active").default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("promo_codes_code_idx").on(t.code),
]);

// ─── PROMO CODE USES ─────────────────────────────────────────
export const promoCodeUses = pgTable("promo_code_uses", {
  id: uuid("id").defaultRandom().primaryKey(),
  promoCodeId: uuid("promo_code_id").notNull().references(() => promoCodes.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  bookingId: uuid("booking_id").references(() => bookings.id),
  discountApplied: decimal("discount_applied", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("promo_code_uses_promo_idx").on(t.promoCodeId),
  index("promo_code_uses_user_idx").on(t.userId),
]);

// ─── CONCIERGE MEMORY ──────────────────────────────────────────
// Persistent memory for AI concierge — stores learned facts about users
// so agents get smarter with every interaction
export const conciergeMemory = pgTable("concierge_memory", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Category of memory: preference, trip_history, interaction, personal
  category: varchar("category", { length: 32 }).notNull(),
  // The learned fact (e.g. "prefers budget stays", "traveling with toddler")
  fact: text("fact").notNull(),
  // Source context (what conversation led to this memory)
  source: text("source"),
  // Confidence score 0-1 (inferred vs explicitly stated)
  confidence: decimal("confidence", { precision: 3, scale: 2 }).default("0.80").notNull(),
  // Last time this memory was relevant/used
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("concierge_memory_user_idx").on(t.userId),
  index("concierge_memory_category_idx").on(t.category),
]);

// ─── SEARCH HISTORY ──────────────────────────────────────────
export const searchHistory = pgTable("search_history", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  filters: json("filters").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("search_history_user_idx").on(t.userId),
]);

// ─── REVIEW SUB-RATINGS ─────────────────────────────────────
export const reviewSubRatings = pgTable("review_sub_ratings", {
  id: serial("id").primaryKey(),
  reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 32 }).notNull(), // cleanliness, accuracy, location, value, communication, checkin
  rating: integer("rating").notNull(),
}, (t) => [
  index("review_sub_ratings_review_idx").on(t.reviewId),
]);

// ─── REVIEW VOTES (helpful) ─────────────────────────────────
export const reviewVotes = pgTable("review_votes", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reviewId: uuid("review_id").notNull().references(() => reviews.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.reviewId] }),
]);

// ─── GIFT CARDS ──────────────────────────────────────────────
export const giftCards = pgTable("gift_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  purchaserId: uuid("purchaser_id").references(() => users.id),
  recipientEmail: varchar("recipient_email", { length: 320 }),
  recipientName: varchar("recipient_name", { length: 256 }),
  personalMessage: text("personal_message"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 8 }).default("USD"),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("gift_cards_code_idx").on(t.code),
]);

// ─── PAYOUT SCHEDULES ────────────────────────────────────────
export const payoutSchedules = pgTable("payout_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorId: uuid("operator_id").notNull().references(() => users.id).unique(),
  frequency: varchar("frequency", { length: 16 }).default("weekly").notNull(), // weekly, biweekly, monthly
  dayOfWeek: integer("day_of_week").default(1), // 0=Sun, 1=Mon, ...
  dayOfMonth: integer("day_of_month").default(1), // for monthly payouts
  minPayout: decimal("min_payout", { precision: 10, scale: 2 }).default("10.00"),
  stripeAccountId: varchar("stripe_account_id", { length: 128 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── TAX DOCUMENTS ───────────────────────────────────────────
export const taxDocuments = pgTable("tax_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorId: uuid("operator_id").notNull().references(() => users.id),
  year: integer("year").notNull(),
  totalEarnings: decimal("total_earnings", { precision: 12, scale: 2 }).notNull(),
  totalBookings: integer("total_bookings").notNull(),
  totalPayouts: decimal("total_payouts", { precision: 12, scale: 2 }),
  documentUrl: text("document_url"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (t) => [
  index("tax_docs_operator_idx").on(t.operatorId),
]);

// ─── MESSAGE TEMPLATES ───────────────────────────────────────
export const messageTemplates = pgTable("message_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorId: uuid("operator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 128 }).notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut", { length: 32 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("message_templates_operator_idx").on(t.operatorId),
]);

// ─── DYNAMIC PRICING RULES ──────────────────────────────────
export const pricingRules = pgTable("pricing_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 16 }).notNull(), // surge, seasonal, weekday, weekend
  name: varchar("name", { length: 128 }),
  multiplier: decimal("multiplier", { precision: 4, scale: 2 }).notNull(), // e.g. 1.50 = +50%
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  daysOfWeek: json("days_of_week").$type<number[]>(), // [0,6] for weekends
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("pricing_rules_listing_idx").on(t.listingId),
]);

// ─── OPERATOR TEAM MEMBERS ───────────────────────────────────
export const operatorTeamMembers = pgTable("operator_team_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorId: uuid("operator_id").notNull().references(() => users.id),
  memberId: uuid("member_id").notNull().references(() => users.id),
  role: varchar("role", { length: 16 }).default("cohost").notNull(), // cohost, staff
  permissions: json("permissions").$type<string[]>(), // ["manage_listings", "view_bookings", "reply_messages"]
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("operator_team_operator_idx").on(t.operatorId),
  index("operator_team_member_idx").on(t.memberId),
]);

// ─── REPORTS (flag listing/user/review) ──────────────────────
export const reportStatusEnum = pgEnum("report_status", [
  "pending", "reviewed", "resolved", "dismissed"
]);

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  targetType: varchar("target_type", { length: 16 }).notNull(), // listing, user, review
  targetId: varchar("target_id", { length: 128 }).notNull(),
  reason: varchar("reason", { length: 64 }).notNull(), // inappropriate, misleading, spam, safety, other
  description: text("description"),
  status: reportStatusEnum("status").default("pending").notNull(),
  adminNotes: text("admin_notes"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("reports_status_idx").on(t.status),
  index("reports_target_idx").on(t.targetType, t.targetId),
]);

// ─── ID VERIFICATIONS ────────────────────────────────────────
export const verificationStatusEnum = pgEnum("verification_status", [
  "pending", "approved", "rejected"
]);

export const idVerifications = pgTable("id_verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  documentType: varchar("document_type", { length: 32 }).notNull(), // passport, drivers_license, national_id
  documentUrl: text("document_url").notNull(),
  selfieUrl: text("selfie_url"),
  status: verificationStatusEnum("status").default("pending").notNull(),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── FEATURE FLAGS ───────────────────────────────────────────
export const featureFlags = pgTable("feature_flags", {
  key: varchar("key", { length: 128 }).primaryKey(),
  enabled: boolean("enabled").default(false).notNull(),
  rolloutPercent: integer("rollout_percent").default(100),
  allowedUsers: json("allowed_users").$type<string[]>(),
  description: text("description"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── A/B TESTS ───────────────────────────────────────────────
export const abTests = pgTable("ab_tests", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  variants: json("variants").$type<{ name: string; weight: number }[]>().notNull(),
  trafficPercent: integer("traffic_percent").default(100),
  isActive: boolean("is_active").default(true),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const abTestAssignments = pgTable("ab_test_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  testId: uuid("test_id").notNull().references(() => abTests.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  variant: varchar("variant", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("ab_assignments_test_idx").on(t.testId),
  index("ab_assignments_user_idx").on(t.userId),
]);

// ─── WISHLIST COLLECTIONS ────────────────────────────────────
export const wishlistCollections = pgTable("wishlist_collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("wishlist_collections_user_idx").on(t.userId),
]);

export const wishlistItems = pgTable("wishlist_items", {
  collectionId: uuid("collection_id").notNull().references(() => wishlistCollections.id, { onDelete: "cascade" }),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.collectionId, t.listingId] }),
]);
