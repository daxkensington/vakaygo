import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="pt-24 pb-20 bg-cream-50 min-h-screen">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-3xl font-bold text-navy-700 mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Privacy Policy
          </h1>
          <p className="text-navy-400 mb-10">Last updated: March 2026</p>

          <div className="bg-white rounded-2xl p-8 md:p-10 shadow-[var(--shadow-card)] prose-navy">
            <div className="space-y-8 text-navy-600 leading-relaxed text-[15px]">
              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">1. Information We Collect</h2>
                <p>When you use VakayGo, we collect information you provide directly: your name, email address, phone number, and payment information when making bookings. For operators, we also collect business details, listing information, and payout details.</p>
                <p className="mt-3">We automatically collect usage data including IP address, browser type, pages visited, and interaction patterns to improve our platform.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">2. How We Use Your Information</h2>
                <p>We use your information to: process bookings, communicate with you about your trips, send booking confirmations and reminders, improve our platform, and connect travelers with operators. We do not sell your personal information to third parties.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">3. Information Sharing</h2>
                <p>We share your information with: operators when you make a booking (name, contact details, booking requirements), payment processors to handle transactions, and email service providers for communications. We may also share data when required by law.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">4. Data Security</h2>
                <p>We implement industry-standard security measures including encrypted data transmission (SSL/TLS), secure password hashing, and regular security audits. Payment information is processed by PCI-compliant payment processors.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">5. Your Rights</h2>
                <p>You can access, update, or delete your account information at any time. To request data deletion, contact us at hello@vakaygo.com. We will respond within 30 days.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">6. Cookies</h2>
                <p>We use essential cookies for authentication and session management. We use analytics cookies to understand how visitors use our platform. You can control cookie preferences in your browser settings.</p>
              </section>

              <section>
                <h2 className="text-xl font-bold text-navy-700 mb-3">7. Contact</h2>
                <p>For privacy-related questions, contact us at <a href="mailto:hello@vakaygo.com" className="text-gold-500 font-medium">hello@vakaygo.com</a>.</p>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
