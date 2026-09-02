import sanitize from "sanitize-html";

/**
 * Allowlist sanitizer for blog/guide HTML.
 *
 * Replaces isomorphic-dompurify, which pulls jsdom in on the server. On
 * Vercel that chain (jsdom → html-encoding-sniffer 6 → the ESM-only
 * @exodus/bytes) blew up with ERR_REQUIRE_ESM and every /guides/* page
 * returned 500. sanitize-html is htmlparser2-based and runs identically in
 * the browser and in the lambda, so the same function serves SSR and the
 * editor preview.
 */
const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr",
  "ul", "ol", "li", "a", "strong", "em", "b", "i", "u",
  "blockquote", "pre", "code", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tr", "th", "td",
  "div", "span", "section", "article",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "class", "id", "target", "rel", "width", "height"];

export function sanitizeBlogHtml(html: string): string {
  return sanitize(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { "*": ALLOWED_ATTR },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    // Any target=_blank link gets rel=noopener so it can't reach back.
    transformTags: {
      a: (tagName, attribs) =>
        attribs.target === "_blank"
          ? { tagName, attribs: { ...attribs, rel: "noopener noreferrer" } }
          : { tagName, attribs },
    },
    disallowedTagsMode: "discard",
  });
}
