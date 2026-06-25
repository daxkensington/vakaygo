/**
 * Serialize an object for embedding inside a
 * `<script type="application/ld+json" dangerouslySetInnerHTML=...>` block.
 *
 * Plain JSON.stringify is unsafe here: a value containing `</script>` (or
 * markup like `<img onerror=...>`) breaks out of the script element and yields
 * stored XSS, because much of our JSON-LD interpolates operator-controlled
 * fields (listing title, parish, island, guide content). Escaping the three
 * HTML-significant characters makes the payload inert while remaining valid
 * JSON-LD that crawlers still parse.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
