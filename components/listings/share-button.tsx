"use client";

import { useState, useRef, useEffect } from "react";
import {
  Share2,
  Link as LinkIcon,
  Check,
  Mail,
} from "lucide-react";

type ShareButtonProps = {
  title: string;
  url: string;
};

export function ShareButton({ title, url }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleShare() {
    // Use native share on mobile if available
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled or error — fall through to dropdown
        setOpen(true);
      }
      return;
    }
    setOpen((prev) => !prev);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1500);
    } catch {
      // fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1500);
    }
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(`Check out ${title}: ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
    setOpen(false);
  }

  function shareFacebook() {
    const encoded = encodeURIComponent(url);
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
      "_blank"
    );
    setOpen(false);
  }

  function shareTwitter() {
    const text = encodeURIComponent(title);
    const encoded = encodeURIComponent(url);
    window.open(
      `https://twitter.com/intent/tweet?url=${encoded}&text=${text}`,
      "_blank"
    );
    setOpen(false);
  }

  function shareEmail() {
    const subject = encodeURIComponent(`Check out: ${title}`);
    const body = encodeURIComponent(
      `I found this on VakayGo and thought you'd like it:\n\n${title}\n${url}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
    setOpen(false);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleShare}
        className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-navy-400 hover:text-gold-500 transition-colors"
        aria-label="Share this listing"
      >
        <Share2 size={18} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-52 bg-white rounded-xl shadow-lg border border-cream-100 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-navy-600 hover:bg-cream-50 transition-colors"
          >
            {copied ? (
              <Check size={16} className="text-teal-500" />
            ) : (
              <LinkIcon size={16} className="text-navy-400" />
            )}
            {copied ? "Copied!" : "Copy Link"}
          </button>

          <button
            onClick={shareWhatsApp}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-navy-600 hover:bg-cream-50 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-navy-400"
            >
              <path
                d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
                fill="currentColor"
              />
              <path
                d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.96 7.96 0 01-4.108-1.137l-.292-.175-3.024.793.807-2.953-.192-.304A7.963 7.963 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"
                fill="currentColor"
              />
            </svg>
            WhatsApp
          </button>

          <button
            onClick={shareFacebook}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-navy-600 hover:bg-cream-50 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-navy-400"
            >
              <path
                d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.875V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z"
                fill="currentColor"
              />
            </svg>
            Facebook
          </button>

          <button
            onClick={shareTwitter}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-navy-600 hover:bg-cream-50 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-navy-400"
            >
              <path
                d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                fill="currentColor"
              />
            </svg>
            X (Twitter)
          </button>

          <button
            onClick={shareEmail}
            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-navy-600 hover:bg-cream-50 transition-colors"
          >
            <Mail size={16} className="text-navy-400" />
            Email
          </button>
        </div>
      )}
    </div>
  );
}
