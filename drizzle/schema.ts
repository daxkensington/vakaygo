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
    businessName: varchar("business_name", { length: 256 }),
    businessDescription: text("business_description"),
    businessPhone: varchar("business_phone", { length: 20 }),
    businessLogo: text("business_logo"),
    islandId: integer("island_id").references(() => islands.id),
    digipayMerchantId: varchar("digipay_merchant_id", { length: 128 }),
    onboardingComplete: boolean("onboarding_complete").default(false),
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
    avgRating: decimal("avg_rating", { precision: 3, scale: 2 }).default(
      "0.00"
    ),
    reviewCount: integer("review_count").default(0),
    isFeatured: boolean("is_featured").default(false),
    isInstantBook: boolean("is_instant_book").default(false),
    metaTitle: varchar("meta_title", { length: 256 }),
    metaDescription: varchar("meta_description", { length: 512 }),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("reviews_listing_idx").on(t.listingId)]
);

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
