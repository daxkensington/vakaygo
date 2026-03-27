# VakayGo — Product Specification

## Competitive Intelligence Summary

Researched: Airbnb, Booking.com, Viator, GetYourGuide, OpenTable, Yelp, TheFork, Google Maps, Eventbrite, Fever, Uber, GetTransfer, Welcome Pickups, Bookaway, ToursByLocals, Withlocals, Airbnb Experiences

---

## PHASE 1 — MVP (Launch-Ready)

### 1. UNIVERSAL PLATFORM FEATURES

#### Auth & Accounts
- [ ] Email/password signup + Google OAuth
- [ ] Role selection at signup: Traveler or Operator
- [ ] Guest checkout for bookings (no account required — Booking.com's #1 conversion advantage)
- [ ] Email verification
- [ ] Profile: photo, name, phone, bio, languages spoken
- [ ] Operator profiles: business name, logo, description, island, contact info

#### Search & Discovery
- [ ] Global search bar: destination + dates + guests
- [ ] Category tabs (Airbnb-style horizontal scroll): Stays, Tours, Dining, Events, Transport, Guides
- [ ] Split-screen: listing cards (left) + interactive map (right) with price pins
- [ ] Filters per vertical:
  - Universal: price range slider, rating (3+, 4+, 4.5+), sort (recommended, price, rating, newest)
  - Stays: bedrooms, bathrooms, guests, amenities, property type, instant book
  - Tours: duration, time of day, language, group size, tour type
  - Dining: cuisine type, price range ($-$$$$), meal type, dietary, open now
  - Events: date, category, free/paid, age restriction
  - Transport: vehicle type, passengers, luggage
  - Guides: language, specialty, availability
- [ ] Map view with clustering, price bubbles, "search as I move"
- [ ] Saved/wishlist with named collections
- [ ] Recently viewed
- [ ] "Coming Soon" badges for pre-launch listings

#### Island Destination Pages
- [ ] Hero image + island description
- [ ] Category-filtered sub-sections (stays, tours, dining, etc.)
- [ ] Parish/neighborhood breakdown (Grenada parishes)
- [ ] "Top Experiences" curated section
- [ ] Quick stats: listing count, avg rating, popular categories

### 2. STAYS (Competing with Airbnb + Booking.com)

#### Listing Page
- [ ] Photo gallery: 5-image hero grid, click to expand full gallery
- [ ] Title, location, star rating, review count
- [ ] Quick highlights: guests, bedrooms, beds, bathrooms
- [ ] Host card: photo, name, Superhost badge, response rate
- [ ] Full description with "Show more" truncation
- [ ] Sleeping arrangements: visual bedroom cards with bed types
- [ ] Amenities grid with icons (WiFi, kitchen, AC, pool, parking, etc.)
- [ ] Location map (neighborhood level, exact address after booking)
- [ ] Availability calendar (2-month inline view)
- [ ] House rules: check-in/out times, pets, smoking, max guests
- [ ] Cancellation policy with timeline visualization
- [ ] Reviews section with 6 category scores (cleanliness, accuracy, check-in, communication, location, value)
- [ ] Similar listings carousel

#### Booking Widget (Sticky Sidebar)
- [ ] Date picker (check-in / check-out)
- [ ] Guest selector (adults, children, infants)
- [ ] Price breakdown: nightly rate × nights, cleaning fee, service fee, taxes, total
- [ ] "Reserve" button (instant book) or "Request to Book"
- [ ] "You won't be charged yet" reassurance

#### Operator Tools — Stays
- [ ] Listing creation wizard: photos, details, amenities, pricing, house rules, cancellation policy
- [ ] Calendar management: block dates, custom pricing per date, min/max stay
- [ ] Smart pricing toggle: set min/max, AI adjusts based on demand
- [ ] Weekend pricing separate from weekday
- [ ] Weekly/monthly discount settings
- [ ] Cleaning fee, extra guest fee
- [ ] iCal sync for cross-platform calendars
- [ ] Booking inbox: accept/decline requests, guest messaging
- [ ] Scheduled messages: auto-send at booking, check-in, checkout
- [ ] Analytics: views, booking rate, occupancy, revenue, rating trends

### 3. TOURS & EXCURSIONS (Competing with Viator + GetYourGuide)

#### Listing Page
- [ ] Photo carousel (5-15 images)
- [ ] Title, duration, rating, review count, badges (Free Cancellation, Instant Book, Small Group)
- [ ] Overview/description with highlights
- [ ] What's Included (checkmarks) / What's Excluded (X marks)
- [ ] Meeting point with map pin and detailed instructions
- [ ] What to Expect: itinerary broken into stops with times
- [ ] Group size, languages, accessibility info
- [ ] Cancellation policy (prominently displayed)
- [ ] Reviews with sub-categories (Guide, Value, Organization)
- [ ] Operator info with link to their other tours
- [ ] Similar tours carousel

#### Booking Flow
- [ ] Date selection calendar (unavailable dates greyed, "X spots left" urgency)
- [ ] Time slot selection
- [ ] Guest count by category (adults, children, infants) with per-category pricing
- [ ] Tour tier options (Standard/Premium/VIP) if applicable
- [ ] Add-ons (lunch, hotel pickup, photo package)
- [ ] Special requests text field
- [ ] Checkout: guest details, payment, promo code, price breakdown
- [ ] Confirmation with QR voucher (email + app + Apple/Google Wallet)

#### Operator Tools — Tours
- [ ] Tour creation: description, photos, itinerary builder, pricing, inclusions/exclusions
- [ ] Availability: recurring schedules (Mon/Wed/Fri at 9am and 2pm), capacity per slot, cut-off time
- [ ] Pricing: per person, per group, age categories, seasonal pricing
- [ ] Booking management: accept/decline, guest details, no-show tracking
- [ ] Customer messaging
- [ ] Promo code creation
- [ ] Analytics: bookings, revenue, conversion, reviews

### 4. DINING (Competing with OpenTable + TheFork + Yelp)

#### Restaurant Page
- [ ] Photo gallery (restaurant + diner-uploaded)
- [ ] Cuisine type, price range ($-$$$$), hours, address, map
- [ ] Reservation widget: party size, date, time → available slots as buttons
- [ ] Menu display (uploaded PDF/photos or structured menu with prices)
- [ ] "Popular Dishes" with photos
- [ ] Reviews with sub-ratings: food, service, ambiance, value
- [ ] Verified diner reviews only (reservation must be honored)
- [ ] Restaurant response to reviews
- [ ] Special offers / promotions display (TheFork-style discounts)
- [ ] "Open Now" indicator

#### Reservation Flow
- [ ] Party size, date, time selection
- [ ] Available time slots shown as clickable buttons
- [ ] Seating preference (indoor, outdoor, bar)
- [ ] Diner details: name, phone, email
- [ ] Special requests (allergies, celebrations, high chair)
- [ ] Occasion tag (birthday, anniversary, business, date night)
- [ ] Confirmation email + SMS
- [ ] Reminders: 24h before + 2h before
- [ ] No-show tracking

#### Operator Tools — Dining
- [ ] Restaurant profile: photos, menu, hours, cuisine, price range
- [ ] Reservation management: calendar view, manual add/edit
- [ ] Table management: floor plan editor (stretch goal)
- [ ] Guest CRM: visit history, preferences, allergies, VIP tags
- [ ] Promotions: off-peak discounts, special menus
- [ ] Analytics: covers, peak hours, no-show rate, review scores
- [ ] Waitlist with SMS notifications (stretch goal)

### 5. EVENTS (Competing with Eventbrite + Fever)

#### Event Page
- [ ] Hero image/carousel, title, date/time with timezone
- [ ] Venue with map + directions
- [ ] Full description with rich text
- [ ] Ticket tiers: name, price, description, availability status, "X remaining" urgency
- [ ] Lineup/performers (for music/entertainment)
- [ ] Age restriction, dress code
- [ ] Organizer info + past events
- [ ] Refund policy
- [ ] Share buttons
- [ ] "Add to Calendar" (Google, Apple, Outlook)
- [ ] Similar events

#### Ticket Purchase Flow
- [ ] Tier selection with quantity per tier
- [ ] Promo code input
- [ ] Attendee info (name, email per ticket)
- [ ] Checkout with price breakdown (subtotal, service fee, total)
- [ ] QR code ticket delivery: email, in-app, Apple/Google Wallet
- [ ] Ticket transfer to another person

#### Organizer Tools — Events
- [ ] Event creation wizard: info, description, tickets, publish
- [ ] Ticket tier management: capacity, pricing, early bird, hidden tiers
- [ ] Promo codes: percentage off, flat, limited uses, expiry
- [ ] Attendee list with export (CSV)
- [ ] Mobile QR check-in scanner
- [ ] Email attendees (all or by tier)
- [ ] Analytics: sales, revenue, page views, traffic sources
- [ ] Recurring event templates
- [ ] Refund management

### 6. TRANSPORT (Competing with Uber + GetTransfer + Welcome Pickups)

#### Booking Page
- [ ] Pickup/dropoff with address autocomplete + airport/port selector
- [ ] Date + time picker
- [ ] Passengers + luggage count
- [ ] Vehicle selection cards: photo, type, capacity, price (fixed)
- [ ] Round trip toggle
- [ ] Flight number input (for tracking)
- [ ] Special requirements: child seat, wheelchair, pet
- [ ] Price: fixed, all-inclusive, no surge
- [ ] Checkout with confirmation

#### Rider Experience
- [ ] Confirmation with driver name, photo, vehicle, plate number
- [ ] Real-time GPS tracking (driver en route + during trip)
- [ ] In-app messaging with driver
- [ ] Meet & greet option (name sign at arrivals)
- [ ] Trip sharing: share live location with contacts
- [ ] Two-way rating after trip

#### Driver Dashboard
- [ ] Accept/decline bookings
- [ ] Calendar with upcoming bookings
- [ ] Earnings: per trip, daily, weekly, monthly
- [ ] Navigation to pickup
- [ ] "I've arrived" / "Trip started" / "Trip completed" buttons
- [ ] Performance: rating, acceptance rate, on-time %
- [ ] Payout management

### 7. LOCAL GUIDES (Competing with ToursByLocals + Withlocals)

#### Guide Profile
- [ ] Photo, bio, video intro
- [ ] Languages, specialties, years of experience
- [ ] Certifications / credentials
- [ ] Reviews with category ratings
- [ ] Portfolio gallery
- [ ] Available experiences list
- [ ] Response time/rate
- [ ] Superguide badge (4.8+ rating, 10+ bookings)

#### Experience Page
- [ ] Photos, title, description, itinerary/stops
- [ ] What's included / what to bring
- [ ] Duration, group size, difficulty level
- [ ] Private vs shared option
- [ ] Calendar with available dates/times
- [ ] Custom tour request option

#### Booking Flow
- [ ] Date + time selection
- [ ] Group size + pricing
- [ ] Message to guide (interests, special requests)
- [ ] Checkout
- [ ] Meeting point revealed post-booking
- [ ] Pre-trip message thread

#### Guide Dashboard
- [ ] Experience creation wizard
- [ ] Calendar/availability: recurring schedule, blackout dates, buffer times
- [ ] Booking management: accept/decline, guest details
- [ ] Earnings + payouts
- [ ] Review management + responses
- [ ] Custom tour request inbox

---

## PHASE 2 — Post-Launch (Weeks 7-16)

### AI Trip Planner
- [ ] Natural language input: "3-day romantic getaway in Grenada"
- [ ] AI generates day-by-day itinerary from real listings
- [ ] Mix of stays, tours, dining, events, transport
- [ ] Edit/customize itinerary
- [ ] Book entire itinerary in one flow
- [ ] Share itinerary with travel companions
- [ ] Save + publish public itineraries

### Loyalty Program
- [ ] Points per booking across all verticals
- [ ] Tiered levels (Explorer, Adventurer, Islander)
- [ ] Redeem points for discounts
- [ ] Level perks: free upgrades, priority booking, exclusive deals

### Advanced Operator Tools
- [ ] Dynamic/smart pricing across all verticals
- [ ] Competitor benchmarking ("similar listings charge $X")
- [ ] Revenue analytics with forecasting
- [ ] Multi-listing management
- [ ] Automated review request emails
- [ ] Promotion/deal creation tools

### Platform Features
- [ ] Push notifications (booking confirmations, reminders, review prompts)
- [ ] Multi-currency with live conversion
- [ ] WhatsApp integration for confirmations
- [ ] Offline mode (downloaded bookings, vouchers, maps)
- [ ] Group booking with cost splitting
- [ ] Admin moderation panel

---

## PHASE 3 — Growth (Months 5-12)

### Fintech Layer
- [ ] Trip insurance (cancel-for-any-reason)
- [ ] Price freeze ($5-15 to lock a rate for 48h)
- [ ] Buy Now Pay Later (installment payments)
- [ ] Operator cash advances (against future bookings)

### Content & Community
- [ ] Destination guides (editorial content)
- [ ] User-generated travel stories
- [ ] Creator/influencer referral program with commission
- [ ] Collaborative wishlists for group trip planning

### Expansion Tools
- [ ] Multi-island onboarding playbook
- [ ] Self-serve operator signup
- [ ] API for channel managers
- [ ] B2B widget (hotels embed VakayGo on their sites)
- [ ] Travel agent portal with net rates

---

## COMMISSION MODEL

| Vertical | Traveler Service Fee | Operator Commission | Total Platform Revenue |
|----------|---------------------|---------------------|----------------------|
| Stays | 5-8% | 10-12% | 15-20% |
| Tours | 5-8% | 15-18% | 20-25% |
| Dining | 0% | $0.50-1.00/cover | Per-cover |
| Events | 3-5% + $0.50/ticket | 5-8% | 8-13% |
| Transport | 5% | 12-15% | 17-20% |
| Guides | 5-8% | 15-18% | 20-25% |

**Key positioning:** Lower than Viator (20-30%), lower than Airbnb (15%), competitive with Booking.com (15-25%). "We take less so local businesses earn more."

---

## DESIGN PRINCIPLES

1. **No borders on cards** — shadow-only depth
2. **Real photography everywhere** — no stock illustrations
3. **Visual variety between sections** — alternate layouts, colors, patterns
4. **Mobile-first** — every feature works perfectly on phone
5. **Speed** — sub-2-second page loads, instant search
6. **Glass morphism** for overlays and search bars
7. **Micro-animations** on every interaction (hover, click, scroll)
8. **Golden Hour palette** — gold, teal, cream, navy throughout
9. **Serif headlines + sans body** — premium but approachable
10. **Generous whitespace** — let content breathe
