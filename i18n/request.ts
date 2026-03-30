import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";

export default getRequestConfig(async () => {
  // Check cookie first, then Accept-Language header
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value as Locale | undefined;

  let locale: Locale = defaultLocale;

  if (cookieLocale && locales.includes(cookieLocale)) {
    locale = cookieLocale;
  } else {
    // Auto-detect from browser
    const headerStore = await headers();
    const acceptLang = headerStore.get("accept-language") || "";
    for (const l of locales) {
      if (acceptLang.toLowerCase().includes(l)) {
        locale = l;
        break;
      }
    }
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
