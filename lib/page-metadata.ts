import type { Metadata } from "next";

const ORIGIN = "https://vakaygo.com";
const SHARE_IMAGE = { url: `${ORIGIN}/images/hero/caribbean-hero.jpg`, width: 1200, height: 630, alt: "VakayGo" };

/**
 * Metadata for a static page. A child segment that sets only a title inherits
 * the root layout's description and Open Graph url/title, so every such page
 * used to tell search engines and link previews that it was the homepage.
 * The title gets the root template's " | VakayGo" suffix; pass it without the brand.
 */
export function staticPageMetadata(path: string, title: string, description: string, options: { noindex?: boolean } = {}): Metadata {
  const url = `${ORIGIN}${path}`;
  const shareTitle = `${title} | VakayGo`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "VakayGo", url, title: shareTitle, description, images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [SHARE_IMAGE.url] },
    ...(options.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
