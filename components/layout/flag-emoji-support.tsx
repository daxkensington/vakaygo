"use client";

import { useEffect } from "react";
import { flagEmojiSupported, NO_FLAG_EMOJI_CLASS } from "@/lib/flag-emoji";

/**
 * Marks the document when the platform cannot draw flag emoji, so `.flag-emoji`
 * spans disappear instead of showing letter pairs ("GD Grenada"). Runs after
 * hydration: reading the user agent on the server would make every cached page
 * dynamic.
 */
export function FlagEmojiSupport() {
  useEffect(() => {
    if (!flagEmojiSupported(navigator.userAgent)) document.documentElement.classList.add(NO_FLAG_EMOJI_CLASS);
  }, []);
  return null;
}
