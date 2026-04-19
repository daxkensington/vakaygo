"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { useAuth } from "@/lib/auth-context";
import {
  Shield,
  Smartphone,
  QrCode,
  CheckCircle,
  Loader2,
  Upload,
  AlertCircle,
  Clock,
  XCircle,
  Camera,
  FileText,
} from "lucide-react";

type TotpData = {
  enabled: boolean;
  qrCodeUrl?: string;
  secret?: string;
};

type PhoneVerification = {
  verified: boolean;
  phone: string | null;
};

type IdVerification = {
  status: "none" | "pending" | "approved" | "rejected";
  rejectionReason?: string;
};

export default function SecurityPage() {
  const { user, loading: authLoading } = useAuth();

  // TOTP state
  const [totp, setTotp] = useState<TotpData>({ enabled: false });
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(true);
  const [totpSaving, setTotpSaving] = useState(false);
  const [totpError, setTotpError] = useState("");
  const [totpSuccess, setTotpSuccess] = useState("");

  // Phone state
  const [phone, setPhone] = useState<PhoneVerification>({ verified: false, phone: null });
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(true);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState("");

  // ID Verification state
  const [idStatus, setIdStatus] = useState<IdVerification>({ status: "none" });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [idLoading, setIdLoading] = useState(true);
  const [idSaving, setIdSaving] = useState(false);
  const [idError, setIdError] = useState("");
  const [idSuccess, setIdSuccess] = useState("");

  // Fetch TOTP status
  useEffect(() => {
    if (!user) return;
    fetch("/api/auth/totp")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setTotp(data);
      })
      .catch(() => {})
      .finally(() => setTotpLoading(false));
  }, [user]);

  // Fetch phone verification status
  useEffect(() => {
    if (!user) return;
    fetch("/api/auth/phone-verify")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setPhone(data);
          if (data.phone) setPhoneNumber(data.phone);
        }
      })
      .catch(() => {})
      .finally(() => setPhoneLoading(false));
  }, [user]);

  // Fetch ID verification status
  useEffect(() => {
    if (!user) return;
    fetch("/api/id-verification")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setIdStatus(data);
      })
      .catch(() => {})
      .finally(() => setIdLoading(false));
  }, [user]);

  // TOTP handlers
  async function handleEnableTotp() {
    setTotpError("");
    setTotpSuccess("");
    setTotpSaving(true);
    try {
      const res = await fetch("/api/auth/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTotpError(data.error || "Failed to enable 2FA");
        return;
      }
      setTotp({ enabled: true });
      setTotpCode("");
      setTotpSuccess("Two-factor authentication enabled successfully.");
    } catch {
      setTotpError("Something went wrong. Please try again.");
    } finally {
      setTotpSaving(false);
    }
  }

  async function handleDisableTotp() {
    setTotpError("");
    setTotpSuccess("");
    setTotpSaving(true);
    try {
      const res = await fetch("/api/auth/totp", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setTotpError(data.error || "Failed to disable 2FA");
        return;
      }
      setTotp(data);
      setTotpSuccess("Two-factor authentication disabled.");
    } catch {
      setTotpError("Something went wrong. Please try again.");
    } finally {
      setTotpSaving(false);
    }
  }

  // Phone handlers
  async function handleSendCode() {
    setPhoneError("");
    setPhoneSuccess("");
    setPhoneSaving(true);
    try {
      const res = await fetch("/api/auth/phone-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneError(data.error || "Failed to send code");
        return;
      }
      setPhoneSent(true);
      setPhoneSuccess("Verification code sent to your phone.");
    } catch {
      setPhoneError("Something went wrong. Please try again.");
    } finally {
      setPhoneSaving(false);
    }
  }

  async function handleVerifyPhone() {
    setPhoneError("");
    setPhoneSuccess("");
    setPhoneSaving(true);
    try {
      const res = await fetch("/api/auth/phone-verify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, code: phoneCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneError(data.error || "Invalid verification code");
        return;
      }
      setPhone({ verified: true, phone: phoneNumber });
      setPhoneSent(false);
      setPhoneCode("");
      setPhoneSuccess("Phone number verified successfully.");
    } catch {
      setPhoneError("Something went wrong. Please try again.");
    } finally {
      setPhoneSaving(false);
    }
  }

  // ID verification handler
  async function handleSubmitId() {
    if (!documentFile || !selfieFile) {
      setIdError("Please upload both a document and a selfie.");
      return;
    }
    setIdError("");
    setIdSuccess("");
    setIdSaving(true);
    try {
      const formData = new FormData();
      formData.append("document", documentFile);
      formData.append("selfie", selfieFile);

      const res = await fetch("/api/id-verification", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setIdError(data.error || "Failed to submit verification");
        return;
      }
      setIdStatus({ status: "pending" });
      setDocumentFile(null);
      setSelfieFile(null);
      setIdSuccess("Documents submitted. We will review within 24-48 hours.");
    } catch {
      setIdError("Something went wrong. Please try again.");
    } finally {
      setIdSaving(false);
    }
  }

  if (authLoading) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-cream-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
        </main>
        <Footer />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-cream-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-[var(--shadow-card)] text-center max-w-md mx-4">
            <Shield className="w-12 h-12 text-navy-300 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-navy-700 mb-2">Sign in required</h1>
            <p className="text-navy-400 text-sm">Please sign in to access security settings.</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const idStatusConfig = {
    none: { icon: FileText, color: "text-navy-400", bg: "bg-cream-100", label: "Not submitted" },
    pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", label: "Pending review" },
    approved: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50", label: "Verified" },
    rejected: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", label: "Rejected" },
  };

  const statusCfg = idStatusConfig[idStatus.status];
  const StatusIcon = statusCfg.icon;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-cream-50 py-12">
        <div className="max-w-3xl mx-auto px-6">
          <div className="mb-8">
            <h1
              className="text-3xl font-bold text-navy-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Security Settings
            </h1>
            <p className="text-navy-400 mt-1">
              Protect your account with additional verification.
            </p>
          </div>

          {/* Two-Factor Authentication */}
          <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gold-50 text-gold-700">
                <QrCode size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-navy-700">Two-Factor Authentication</h2>
                <p className="text-sm text-navy-400">Add an extra layer of security with TOTP.</p>
              </div>
              {totp.enabled && (
                <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold">
                  <CheckCircle size={14} />
                  Enabled
                </span>
              )}
            </div>

            {totpLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gold-500" />
              </div>
            ) : totp.enabled ? (
              <div>
                <p className="text-sm text-navy-500 mb-4">
                  Two-factor authentication is currently enabled on your account.
                </p>
                <button
                  onClick={handleDisableTotp}
                  disabled={totpSaving}
                  className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-sm font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {totpSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                  Disable 2FA
                </button>
              </div>
            ) : (
              <div>
                {totp.qrCodeUrl && (
                  <div className="mb-4">
                    <p className="text-sm text-navy-500 mb-3">
                      Scan this QR code with your authenticator app:
                    </p>
                    <div className="bg-white p-4 rounded-xl inline-block shadow-sm">
                      <img
                        src={totp.qrCodeUrl}
                        alt="TOTP QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                    {totp.secret && (
                      <p className="mt-2 text-xs text-navy-400">
                        Manual entry: <code className="bg-cream-100 px-2 py-0.5 rounded text-navy-600">{totp.secret}</code>
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <div className="flex-1 max-w-xs">
                    <label className="block text-sm font-medium text-navy-600 mb-1.5">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                    />
                  </div>
                  <button
                    onClick={handleEnableTotp}
                    disabled={totpSaving || totpCode.length < 6}
                    className="px-5 py-3 rounded-xl bg-gold-700 hover:bg-gold-800 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
                  >
                    {totpSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                    Enable 2FA
                  </button>
                </div>
              </div>
            )}

            {totpError && (
              <div className="mt-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                {totpError}
              </div>
            )}
            {totpSuccess && (
              <div className="mt-4 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                <CheckCircle size={16} />
                {totpSuccess}
              </div>
            )}
          </div>

          {/* Phone Verification */}
          <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] mb-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-50 text-teal-600">
                <Smartphone size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-navy-700">Phone Verification</h2>
                <p className="text-sm text-navy-400">Verify your phone for account recovery.</p>
              </div>
              {phone.verified && (
                <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold">
                  <CheckCircle size={14} />
                  Verified
                </span>
              )}
            </div>

            {phoneLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gold-500" />
              </div>
            ) : phone.verified ? (
              <p className="text-sm text-navy-500">
                Your phone number <span className="font-semibold text-navy-700">{phone.phone}</span> is verified.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-end gap-3">
                  <div className="flex-1 max-w-xs">
                    <label className="block text-sm font-medium text-navy-600 mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                    />
                  </div>
                  <button
                    onClick={handleSendCode}
                    disabled={phoneSaving || !phoneNumber.trim()}
                    className="px-5 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
                  >
                    {phoneSaving && !phoneSent ? <Loader2 size={16} className="animate-spin" /> : null}
                    Send Code
                  </button>
                </div>

                {phoneSent && (
                  <div className="flex items-end gap-3">
                    <div className="flex-1 max-w-xs">
                      <label className="block text-sm font-medium text-navy-600 mb-1.5">
                        Verification Code
                      </label>
                      <input
                        type="text"
                        value={phoneCode}
                        onChange={(e) => setPhoneCode(e.target.value)}
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                        className="w-full px-4 py-3 rounded-xl bg-cream-50 text-navy-700 placeholder:text-navy-300 outline-none focus:ring-2 focus:ring-gold-500/50"
                      />
                    </div>
                    <button
                      onClick={handleVerifyPhone}
                      disabled={phoneSaving || phoneCode.length < 6}
                      className="px-5 py-3 rounded-xl bg-gold-700 hover:bg-gold-800 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
                    >
                      {phoneSaving && phoneSent ? <Loader2 size={16} className="animate-spin" /> : null}
                      Verify
                    </button>
                  </div>
                )}
              </div>
            )}

            {phoneError && (
              <div className="mt-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                {phoneError}
              </div>
            )}
            {phoneSuccess && (
              <div className="mt-4 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                <CheckCircle size={16} />
                {phoneSuccess}
              </div>
            )}
          </div>

          {/* ID Verification */}
          <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gold-50 text-gold-700">
                <Shield size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-navy-700">ID Verification</h2>
                <p className="text-sm text-navy-400">Verify your identity for enhanced trust.</p>
              </div>
              <span className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${statusCfg.bg} ${statusCfg.color} text-xs font-semibold`}>
                <StatusIcon size={14} />
                {statusCfg.label}
              </span>
            </div>

            {idLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gold-500" />
              </div>
            ) : idStatus.status === "approved" ? (
              <p className="text-sm text-navy-500">
                Your identity has been verified. This badge is visible on your profile.
              </p>
            ) : idStatus.status === "pending" ? (
              <div className="bg-amber-50 rounded-xl p-4">
                <p className="text-sm text-amber-700">
                  Your documents are being reviewed. This usually takes 24-48 hours.
                </p>
              </div>
            ) : (
              <div>
                {idStatus.status === "rejected" && idStatus.rejectionReason && (
                  <div className="bg-red-50 rounded-xl p-4 mb-4">
                    <p className="text-sm text-red-600">
                      <span className="font-semibold">Rejected:</span> {idStatus.rejectionReason}
                    </p>
                    <p className="text-xs text-red-500 mt-1">Please re-upload your documents.</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-navy-600 mb-1.5">
                      Government-issued ID
                    </label>
                    <label className="flex flex-col items-center justify-center p-6 rounded-xl bg-cream-50 cursor-pointer hover:bg-cream-100 transition-colors">
                      <FileText size={24} className="text-navy-300 mb-2" />
                      <span className="text-sm text-navy-500 text-center">
                        {documentFile ? documentFile.name : "Click to upload"}
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => setDocumentFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-navy-600 mb-1.5">
                      Selfie with ID
                    </label>
                    <label className="flex flex-col items-center justify-center p-6 rounded-xl bg-cream-50 cursor-pointer hover:bg-cream-100 transition-colors">
                      <Camera size={24} className="text-navy-300 mb-2" />
                      <span className="text-sm text-navy-500 text-center">
                        {selfieFile ? selfieFile.name : "Click to upload"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => setSelfieFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleSubmitId}
                  disabled={idSaving || !documentFile || !selfieFile}
                  className="px-5 py-3 rounded-xl bg-gold-700 hover:bg-gold-800 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {idSaving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  Submit for Verification
                </button>
              </div>
            )}

            {idError && (
              <div className="mt-4 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                <AlertCircle size={16} />
                {idError}
              </div>
            )}
            {idSuccess && (
              <div className="mt-4 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
                <CheckCircle size={16} />
                {idSuccess}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
