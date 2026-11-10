/**
 * Public byline for a guide.
 *
 * The guides were seeded under the demo account, so every one of them was
 * bylined "VakayGo Demo" on the page and in Article JSON-LD. Posts by a
 * placeholder account (or with no author) are published under the editorial
 * identity instead; a real named author is kept as a Person.
 */
export const EDITORIAL_BYLINE = "VakayGo Editorial";

export type GuideAuthor = { name: string; type: "Organization" | "Person" };

function isPlaceholderAuthor(name: string): boolean {
  return /\b(demo|test|admin)\b/i.test(name) || /^vakaygo$/i.test(name);
}

export function guideAuthor(authorName: string | null | undefined): GuideAuthor {
  const name = (authorName || "").trim();
  if (!name || isPlaceholderAuthor(name)) return { name: EDITORIAL_BYLINE, type: "Organization" };
  return { name, type: "Person" };
}

export function guideBylineName(authorName: string | null | undefined): string {
  return guideAuthor(authorName).name;
}

const SITE = "https://vakaygo.com";

function absoluteUrl(pathOrUrl: string): string {
  return /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${SITE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

export type GuideArticleInput = {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  authorName: string | null;
  publishedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

/** Article JSON-LD for a guide page. */
export function buildGuideArticleJsonLd(post: GuideArticleInput) {
  const author = guideAuthor(post.authorName);
  const published = post.publishedAt ?? post.createdAt;
  // A rewrite must register as fresher than the publish date, never older.
  const modified = post.updatedAt && published && post.updatedAt > published ? post.updatedAt : published;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt || "",
    ...(post.coverImage ? { image: absoluteUrl(post.coverImage) } : {}),
    ...(published ? { datePublished: published.toISOString() } : {}),
    ...(modified ? { dateModified: modified.toISOString() } : {}),
    author: {
      "@type": author.type,
      name: author.name,
      ...(author.type === "Organization" ? { url: SITE } : {}),
    },
    publisher: {
      "@type": "Organization",
      name: "VakayGo",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/images/logo.jpg` },
    },
    mainEntityOfPage: `${SITE}/guides/${post.slug}`,
  };
}
