"use client";

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import Link from "next/link";
import { Mail, Clock, MessageCircle, Send, CheckCircle, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

const CATEGORIES = [
  "General",
  "Booking Help",
  "Operator Support",
  "Technical Issue",
  "Partnership",
  "Other",
] as const;

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    category: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-700 to-navy-900" />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <h1
              className="text-4xl md:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Get in <span className="text-gold-400">Touch</span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
              We&apos;re here to help. Whether you have a question about bookings,
              need operator support, or want to partner with us — we&apos;d love to
              hear from you.
            </p>
          </div>
        </section>

        {/* Contact Form + Info */}
        <section className="py-20 bg-cream-50">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
              {/* Left: Form */}
              <div className="lg:col-span-3">
                <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-8 md:p-10">
                  {success ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle size={32} className="text-teal-500" />
                      </div>
                      <h2
                        className="text-2xl font-bold text-navy-700 mb-3"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        Message Sent!
                      </h2>
                      <p className="text-navy-400 max-w-md mx-auto mb-8 leading-relaxed">
                        Thanks for reaching out. We&apos;ve sent a confirmation to your
                        email and our team will respond within 24 hours.
                      </p>
                      <button
                        onClick={() => {
                          setSuccess(false);
                          setForm({ name: "", email: "", category: "", subject: "", message: "" });
                        }}
                        className="text-gold-700 font-semibold hover:text-gold-700 transition-colors"
                      >
                        Send another message
                      </button>
                    </div>
                  ) : (
                    <>
                      <h2
                        className="text-2xl font-bold text-navy-700 mb-6"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        Send us a message
                      </h2>

                      {error && (
                        <div className="bg-red-50 text-red-600 rounded-xl px-4 py-3 mb-6 text-sm">
                          {error}
                        </div>
                      )}

                      <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div>
                            <label className="block text-sm font-medium text-navy-600 mb-1.5">
                              Your Name
                            </label>
                            <input
                              type="text"
                              required
                              value={form.name}
                              onChange={(e) => setForm({ ...form, name: e.target.value })}
                              placeholder="John Doe"
                              className="w-full rounded-xl border border-navy-100 bg-cream-50 px-4 py-3 text-navy-700 placeholder:text-navy-200 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-navy-600 mb-1.5">
                              Email Address
                            </label>
                            <input
                              type="email"
                              required
                              value={form.email}
                              onChange={(e) => setForm({ ...form, email: e.target.value })}
                              placeholder="john@example.com"
                              className="w-full rounded-xl border border-navy-100 bg-cream-50 px-4 py-3 text-navy-700 placeholder:text-navy-200 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-navy-600 mb-1.5">
                            Category
                          </label>
                          <select
                            required
                            value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                            className="w-full rounded-xl border border-navy-100 bg-cream-50 px-4 py-3 text-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all appearance-none"
                          >
                            <option value="" disabled>
                              Select a category
                            </option>
                            {CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-navy-600 mb-1.5">
                            Subject
                          </label>
                          <input
                            type="text"
                            required
                            value={form.subject}
                            onChange={(e) => setForm({ ...form, subject: e.target.value })}
                            placeholder="Brief description of your inquiry"
                            className="w-full rounded-xl border border-navy-100 bg-cream-50 px-4 py-3 text-navy-700 placeholder:text-navy-200 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-navy-600 mb-1.5">
                            Message
                          </label>
                          <textarea
                            required
                            rows={5}
                            value={form.message}
                            onChange={(e) => setForm({ ...form, message: e.target.value })}
                            placeholder="Tell us how we can help..."
                            className="w-full rounded-xl border border-navy-100 bg-cream-50 px-4 py-3 text-navy-700 placeholder:text-navy-200 focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-gold-400 transition-all resize-none"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full bg-gold-700 hover:bg-gold-800 text-white font-semibold py-3.5 rounded-xl transition-all shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {loading ? (
                            <>
                              <Loader2 size={18} className="animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send size={18} />
                              Send Message
                            </>
                          )}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>

              {/* Right: Info Cards */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
                  <div className="w-10 h-10 bg-gold-50 rounded-xl flex items-center justify-center mb-4">
                    <Mail size={20} className="text-gold-500" />
                  </div>
                  <h3 className="font-bold text-navy-700 mb-1">Email Us</h3>
                  <p className="text-navy-400 text-sm mb-3">
                    For general inquiries and support
                  </p>
                  <a
                    href="mailto:hello@vakaygo.com"
                    className="text-gold-700 font-semibold text-sm hover:text-gold-700 transition-colors"
                  >
                    hello@vakaygo.com
                  </a>
                </div>

                <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
                  <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center mb-4">
                    <Clock size={20} className="text-teal-500" />
                  </div>
                  <h3 className="font-bold text-navy-700 mb-1">Response Time</h3>
                  <p className="text-navy-400 text-sm mb-3">
                    We aim to reply quickly
                  </p>
                  <p className="text-teal-600 font-semibold text-sm">
                    Within 24 hours
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] p-6">
                  <div className="w-10 h-10 bg-navy-50 rounded-xl flex items-center justify-center mb-4">
                    <MessageCircle size={20} className="text-navy-400" />
                  </div>
                  <h3 className="font-bold text-navy-700 mb-1">Social</h3>
                  <p className="text-navy-400 text-sm mb-3">
                    Follow us and stay connected
                  </p>
                  <div className="flex gap-4">
                    <span className="text-navy-300 text-sm">Instagram</span>
                    <span className="text-navy-300 text-sm">Facebook</span>
                    <span className="text-navy-300 text-sm">X / Twitter</span>
                  </div>
                </div>

                {/* FAQ Quick Link */}
                <Link
                  href="/faq"
                  className="block bg-gradient-to-br from-navy-700 to-navy-900 rounded-2xl p-6 group hover:shadow-[var(--shadow-card-hover)] transition-all"
                >
                  <h3 className="font-bold text-white mb-2">
                    Looking for answers?
                  </h3>
                  <p className="text-white/60 text-sm mb-4">
                    Browse our frequently asked questions for quick help.
                  </p>
                  <span className="text-gold-400 font-semibold text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                    Check our FAQ
                    <ArrowRight size={16} />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
