"use client";
import { useEffect } from "react";
/** Content is currently English, including for visitors with an old locale cookie. */
export function LocaleHtmlAttrs() {
  useEffect(() => { document.documentElement.lang = "en"; document.documentElement.dir = "ltr"; }, []);
  return null;
}
